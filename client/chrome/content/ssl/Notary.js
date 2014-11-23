// Copyright (c) 2011 Moxie Marlinspike <moxie@thoughtcrime.org>
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation; either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA 02111-1307
// USA


/**
  * This class represents a configured notary.  It is responsible for
  * remembering the notary settings (serializing and deserializing them
  * for the SettingsManager), as well as actively talking to the Notary
  * to validate certificates.  It is accessed from both the XPCOM as well
  * as the ChromeWorker contexts, and is serialized across the boundary.
  *
  **/


function Notary(serialized) {
  if (typeof serialized == 'undefined') {
    this.name = null;
    this.region = null;
    this.bundleLocation = null;
    this.enabled = false;
    this.priority = false;
    this.physicalNotaries = new Array();
    this.open = true;
    this.parent = true;
  } else {
    this.name = serialized.name;
    this.enabled = serialized.enabled;
    this.priority = Boolean(serialized.priority);
    this.bundleLocation = serialized.bundle_location;
    this.region = serialized.region;
    this.open = true;
    this.parent = true;
    this.physicalNotaries = new Array();

    for (var i=0;i<serialized.physical_notaries.length;i++) {
      this.physicalNotaries.push(new PhysicalNotary(serialized.physical_notaries[i]));
    }
  }

  var log_prefix = '[' + this.name + '] ';
  this.log = function(line, json) { CV9BLog.notary(log_prefix + line, json); }
  this.log.error = function(err) { CV9BLog.notary.error(err, log_prefix); }
}

Notary.prototype.getHttpDestinations = function() {
  var destinations = new Array();

  for (var i=0;i<this.physicalNotaries.length;i++) {
    this.log('Adding: ' + this.physicalNotaries[i].host + ' : ' + this.physicalNotaries[i].httpPort);
    destinations.push({
      'host' : this.physicalNotaries[i].host ,
      'port' : this.physicalNotaries[i].httpPort });
  }

  return destinations;
};

Notary.prototype.getHttpProxy = function() {
  return this.physicalNotaries[0].httpProxy;
};

Notary.prototype.getSslProxy = function() {
  return this.physicalNotaries[0].sslProxy;
};

Notary.prototype.getSslDestinations = function() {
  var destinations = new Array();

  for (var i=0;i<this.physicalNotaries.length;i++) {
    destinations.push({'host' : this.physicalNotaries[i].host ,
                        'port' : this.physicalNotaries[i].sslPort});
  }

  return destinations;
};

Notary.prototype.getBouncedDestinations = function() {
  var destinations = new Array();

  for (var i=0;i<this.physicalNotaries.length;i++) {
    destinations.push({
      'host' : this.physicalNotaries[i].host ,
      'port' : 4242 });
  }

  return destinations;
};


Notary.prototype.makeConnection = function(proxy) {
  var notarySocket;

  if (typeof proxy != 'undefined' && proxy != null) {
    this.log('Network proxy for notary: ' + this.httpProxy);
    this.log( 'Bouncing request through: ' +
      proxy.getHttpDestinations() + ' to: ' + this.getBouncedDestinations() );
    notarySocket = new ConvergenceNotarySocket(proxy.getHttpDestinations(), this.getHttpProxy());
    var proxyConnector = new NotaryProxyConnector();
    proxyConnector.makeConnection(notarySocket, this.getBouncedDestinations());
  } else {
    this.log('Creating unbounced notary connection...');
    this.log('SSL proxy for notary: ' + this.sslProxy);
    notarySocket = new ConvergenceNotarySocket(this.getSslDestinations(), this.getSslProxy());
  }

  return notarySocket;
};

Notary.prototype.makeSSLConnection = function(proxy) {
  var notarySocket = this.makeConnection(proxy);
  var notaryCertificate = notarySocket.negotiateSSL();
  var notaryCertificateInfo = new CertificateInfo(notaryCertificate);

  for (var i=0;i<this.physicalNotaries.length;i++) {
    this.log('Comparing: ' +
      notaryCertificateInfo.sha1 + ' and ' + this.physicalNotaries[i].sha1Fingerprint);
    if (notaryCertificateInfo.sha1 == this.physicalNotaries[i].sha1Fingerprint) {
      return notarySocket;
    }
  }

  this.log('Notary certificate did not match local copy...');

  return null;
};


Notary.prototype.sendRequest = function(notarySocket, host, port, ip, certificate) {
  var requestBuilder = new HttpRequestBuilder(host, port, ip, certificate.sha1);
  var request = requestBuilder.buildRequest();
  this.log('Sending request:', request);
  notarySocket.writeBytes(NSS.lib.buffer(request), request.length);
};

Notary.prototype.readResponse = function(notarySocket) {
  var response = new HttpParser(notarySocket);
  this.log('Got notary response: ' + response.getResponseBody());

  return response;
};

Notary.prototype.checkFingerprintList = function(response, certificate) {
  var fingerprintList = response.fingerprintList;

  for (var i in fingerprintList) {
    this.log('Checking fingerprint: '  + fingerprintList[i].fingerprint + ' == ' + certificate.sha1);
    if (fingerprintList[i].fingerprint == certificate.sha1) {
      this.log('Returning success...');
      return ConvergenceResponseStatus.VERIFICATION_SUCCESS;
    }
  }

  this.log('Nothing matched!');
  return ConvergenceResponseStatus.VERIFICATION_FAILURE;
};

Notary.prototype.checkValidity = function(host, port, ip, certificate, proxy) {
  var notarySocket = null;

  try {
    notarySocket = this.makeSSLConnection(proxy);

    if (notarySocket == null) {
      this.log('Failed to construct socket to notary...');
      return ConvergenceResponseStatus.CONNECTIVITY_FAILURE;
    }

    this.sendRequest(notarySocket, host, port, ip, certificate);
    var response = this.readResponse(notarySocket);

    switch (response.getResponseCode()) {
    case 303:
      this.log('Notary response was inconclusive...');
      return ConvergenceResponseStatus.VERIFICATION_INCONCLUSIVE;
    case 409:
      this.log('Notary failed to find matching fingerprint!');
      return ConvergenceResponseStatus.VERIFICATION_FAILURE;
    case 200:
      this.log('Notary indicates match, checking...');
      return this.checkFingerprintList(response.getResponseBodyJson(), certificate);
    default:
      this.log('Got error notary response code: ' + response.getResponseCode());
      return ConvergenceResponseStatus.CONNECTIVITY_FAILURE;
    }
  } catch (e) {
    this.log.error(e);
    return ConvergenceResponseStatus.CONNECTIVITY_FAILURE;
  } finally {
    if (notarySocket != null) {
      notarySocket.close();
    }
  }
};

Notary.prototype.update = function() {
  this.log('Calling update on: ' + this.name);

  if (this.bundleLocation == null ||
      this.bundleLocation.indexOf('https://') != 0)
    return;

  var self = this;

  ConvergenceUtil.persistUrl(this.bundleLocation, function(temporaryFile) {
    var notary = Notary.constructFromBundle(temporaryFile.path);
    if (notary.version < this.version)
      return;

    this.log('Updating notary with new bundle...');

    self.setName(notary.getName());
    self.setBundleLocation(notary.getBundleLocation());
    self.setPhysicalNotaries(notary.getPhysicalNotaries());

    var observerService = Components.classes['@mozilla.org/observer-service;1']
      .getService(Components.interfaces.nsIObserverService);
    observerService.notifyObservers(observerService, 'convergence-notary-updated', null);
  });
};

Notary.prototype.setRegion = function(region) {
  this.region = region;
};

Notary.prototype.getRegion = function() {
  return this.region;
};

Notary.prototype.getName = function() {
  return this.name;
};

Notary.prototype.setName = function(name) {
  this.name = name;
};

Notary.prototype.getEnabled = function() {
  return this.enabled;
};

Notary.prototype.setEnabled = function(value) {
  this.enabled = value;
};

Notary.prototype.getPriority = function() {
  return this.priority;
};

Notary.prototype.setPriority = function(value) {
  this.priority = value;
};

Notary.prototype.setBundleLocation = function(value) {
  this.bundleLocation = value;
};

Notary.prototype.getBundleLocation = function() {
  return this.bundleLocation;
};

Notary.prototype.getPhysicalNotaries = function() {
  return this.physicalNotaries;
};

Notary.prototype.setPhysicalNotaries = function(physicalNotaries) {
  this.physicalNotaries = physicalNotaries;
};

Notary.prototype.serializeForTransport = function(callback) {
  var serializedPhysicalNotaries = new Array();
  var count = this.physicalNotaries.length;
  var self = this;

  for (var i=0;i<this.physicalNotaries.length;i++) {
    this.physicalNotaries[i].serializeForTransport(function(spn) {
      serializedPhysicalNotaries.push(spn);
      count--;
      if(count === 0) callback({
        'name' : self.name,
        'enabled' : self.enabled,
        'priority' : self.priority,
        'bundle_location' : self.bundleLocation,
        'region' : self.region,
        'physical_notaries' : serializedPhysicalNotaries });
    });
  }
};


Notary.prototype.serialize = function(xmlDocument) {
  var proxyElement = xmlDocument.createElement('logical-notary');
  proxyElement.setAttribute('name', this.name);
  proxyElement.setAttribute('enabled', this.enabled);
  proxyElement.setAttribute('priority', this.priority);

  if (this.bundleLocation != null)
    proxyElement.setAttribute('bundle_location', this.bundleLocation);

  if (this.region != null)
    proxyElement.setAttribute('region', this.region);

  for (var i=0;i<this.physicalNotaries.length;i++) {
    var physicalElement = this.physicalNotaries[i].serialize(xmlDocument);
    proxyElement.appendChild(physicalElement);
  }

  return proxyElement;
};

Notary.prototype.deserialize = function(logicalElement, version) {
  if (version > 0) {
    this.name = logicalElement.getAttribute('name');
    this.enabled = (logicalElement.getAttribute('enabled') == 'true');
    this.priority = (logicalElement.getAttribute('priority') == 'true');

    if (logicalElement.hasAttribute('bundle_location'))
      this.bundleLocation = logicalElement.getAttribute('bundle_location');

    if (logicalElement.hasAttribute('region'))
      this.region = logicalElement.getAttribute('region');

    var physicalNotaries = logicalElement.getElementsByTagName('physical-notary');

    for (var i=0;i<physicalNotaries.length;i++) {
      var physicalNotaryElement = physicalNotaries.item(i);
      physicalNotaryElement.QueryInterface(Components.interfaces.nsIDOMElement);

      var physicalNotary = new PhysicalNotary();
      physicalNotary.deserialize(physicalNotaryElement);
      this.physicalNotaries.push(physicalNotary);
    }
  } else {
    this.name = logicalElement.getAttribute('host');
    this.enabled = (logicalElement.getAttribute('enabled') == 'true');

    var physicalNotary = new PhysicalNotary();
    physicalNotary.deserialize(logicalElement);
    this.physicalNotaries.push(physicalNotary);
  }
};

Notary.constructFromV1Json = function(notaryJson) {
  var notary = new Notary();
  var physicalNotaries = new Array();
  var physicalNotariesJson = notaryJson.hosts;

  for (var i=0;i<physicalNotariesJson.length;i++) {
    var physicalNotary = new PhysicalNotary();
    physicalNotary.setHost(physicalNotariesJson[i].host);
    physicalNotary.setHTTPPort(physicalNotariesJson[i].http_port);
    physicalNotary.setSSLPort(physicalNotariesJson[i].ssl_port);
    physicalNotary.setCertificate(physicalNotariesJson[i].certificate);

    physicalNotaries.push(physicalNotary);
  }

  notary.setName(notaryJson.name);
  notary.setBundleLocation(notaryJson.bundle_location);
  notary.setEnabled(true);
  notary.setPhysicalNotaries(physicalNotaries);

  if (typeof notaryJson.region != 'undefined')
    notary.setRegion(notaryJson.region);

  return notary;
};

Notary.constructFromV0Json = function(notaryJson) {
  var notary = new Notary();
  var physicalNotary = new PhysicalNotary();
  var physicalNotaryList = new Array();

  physicalNotary.setHost(notaryJson.host);
  physicalNotary.setSSLPort(notaryJson.ssl_port);
  physicalNotary.setHTTPPort(notaryJson.http_port);
  physicalNotary.setCertificate(notaryJson.certificate);
  physicalNotaryList.push(physicalNotary);

  notary.setName(notaryJson.host);
  notary.setEnabled(true);
  notary.setPhysicalNotaries(physicalNotaryList);

  return notary;
};

Notary.constructFromBundle = function(bundlePath) {
  CV9BLog.notary('Loading bundle: ' + bundlePath);
  Components.utils.import('resource://gre/modules/NetUtil.jsm');

  var file = Components.classes['@mozilla.org/file/local;1']
    .createInstance(Components.interfaces.nsILocalFile);
  file.initWithPath(bundlePath);

  var inputStream = Components.classes['@mozilla.org/network/file-input-stream;1']
    .createInstance(Components.interfaces.nsIFileInputStream);
  inputStream.init(file, -1, 0, 0);

  var notaryBytes = NetUtil.readInputStreamToString(inputStream, inputStream.available());
  var notaryJson = JSON.parse(notaryBytes);

  if ((typeof notaryJson.version == 'undefined') ||
      (notaryJson.version == 0))
  {
    return Notary.constructFromV0Json(notaryJson);
  } else if (notaryJson.version == 1) {
    return Notary.constructFromV1Json(notaryJson);
  } else {
    var exception = new Object();
    exception.version = notaryJson.version;
    throw exception;
  }
};
