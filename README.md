# FreeSpeechMe

FreeSpeechMe is a modification to Moxie Marlinspike's tool Convergence, modified to implement the Namecoin .bit specification.  It can resolve .bit domains to IPv4, IPv6, .onion (Tor), and .b32.i2p (I2P) addresses, and verify .bit TLS certficates via the Namecoin blockchain.  This allows safe usage of self-signed certificates, and DNS for the Tor and I2P anonymity networks, without trusting any third party.  Address mappings and TLS fingerprints are stored in the Namecoin blockchain; see the .bit specification for more details.

FreeSpeechMe is a product of Viral Electron Chaos Laboratories (VECLabs).

## End-User Installation (Firefox Extension)

1. (OPTIONAL) Install namecoind and nmcontrol as per their documentation, and ensure that they are both running.
2. Install the XPI into Firefox.
3. Restart Firefox when prompted.
4. There will be a Convergence icon in the toolbar.  Click its dropdown menu and choose Options.
5. On the Namecoin tab, make sure that "Verify Namecoin (.bit) domains" and "Only verify Namecoin (.bit) domains" are both checked.
6. If you didn't install namecoind and nmcontrol yourself, select "I don't have namecoind or nmcontrol; use the bundled versions."
7. (OPTIONAL) On the Namecoin tab, increase the priorities of resolvers that you want to use (e.g. IPv6, Tor, and I2P).  On the Proxies tab, enter your SOCKS proxy settings for Tor and I2P domains if you want to use those resolvers.
8. Click OK.
9. Click the Convergence icon to turn it green.
10. If you're using the bundled namecoind and nmcontrol, wait about 3-5 hours for the blockchain to download.  You can still browse non-.bit sites in the meantime.
11. That's it!  You can safely browse .bit websites without relying on third-party DNS, and .bit HTTPS websites will automatically have their certificates verified.

## End-User Installation (Standalone Application)

**WARNING: The standalone version is still being developed, and is not ready for general use yet.  Please test it and report bugs, but don't get mad when you find a lot of them.**

1. (REQUIRED) Install namecoind and nmcontrol as per their documentation, and ensure that they are both running.  (The Standalone version does not yet support bundled daemons.)
2. Install XULRunner.  For Linux, this is available via your package manager.  For Windows, download it here: https://ftp.mozilla.org/pub/mozilla.org/xulrunner/releases/latest/runtimes/
3. From a command line, go to the "client-standalone-build" directory (this directory is created when you build; see below), and run the following (include the full path to xulrunner.exe if you're on Windows): xulrunner application.ini
4. In the window that launches, there will be a Convergence icon in the toolbar.  Click its dropdown menu and choose Options.
5. On the Namecoin tab, make sure that "Verify Namecoin (.bit) domains" and "Only verify Namecoin (.bit) domains" are both checked.
6. Don't choose the bundled namecoind/nmcontrol; they don't work yet.
7. (OPTIONAL) On the Namecoin tab, increase the priorities of resolvers that you want to use (e.g. IPv6, Tor, and I2P).  On the Proxies tab, enter your SOCKS proxy settings for Tor and I2P domains if you want to use those resolvers.
8. Click OK.
9. Click the Convergence icon to turn it green.
10. Set your favorite browser to use the proxy settings which are in the main FreeSpeechMe-Standalone window.
11. Close FreeSpeechMe-Standalone.
12. Import the Convergence Certificate Authority into your browser.  On Fedora, Ubuntu, and Windows, install scripts are provided: install_tls_fedora.sh, install_tls_ubuntu.sh and install_tls_windows.bat.  The Windows script must be run as an Administrator.  Note that the Windows script needs the NSS-Tools binaries, which aren't included here.  If you're in a hurry and are okay with using outdated versions (at your own risk!), you can download http://ftp.mozilla.org/pub/mozilla.org/security/nss/releases/NSS_3_11_4_RTM/msvc6.0/WINNT5.0_OPT.OBJ/nss-3.11.4.zip and http://ftp.mozilla.org/pub/mozilla.org/nspr/releases/v4.6.4/msvc6.0/WINNT5.0_OPT.OBJ/nspr-4.6.4.zip , and then copy the contents of the "bin" and "lib" directories of both zips to a new directory "win-nss" inside "client-standalone-build".
13. Reopen FreeSpeechMe-Standalone.
14. You might need to restart your browser for the Certificate Authority to take effect.
15. Look for bugs, report them, and send in pull requests.

## Website Administrators

### TLS

Website Administrators should place the SHA-1 fingerprint of their website in the "fingerprint" field of their Namecoin domain.  Note that the newer "tls" field is not yet supported.  The fingerprint may either include or omit colons.  FreeSpeechMe is not aware of SNI (this is a good thing for privacy reasons); the "fingerprint" field should contain the fingerprint of the certificate presented to browsers when the IP address is typed into the browser.  (The "Common Name" of the certificate does not need to match the domain; only the fingerprint is checked.)  To debug websites which generate a "Convergence Certificate Verification Failure", you can click "View Details" in the yellow bar that appears on the top of the page, and then click "View"; Convergence will show you the certificate it received from the server.  Consult the .bit specification for more information on how to embed TLS fingerprints in the Namecoin blockchain.  An example configuration is at "d/namecoin-tls-test-3".

### Tor/I2P

TLS is typically not used with Tor/I2P (unless Whonix is being used), but should work (not tested).  Be aware that the Host header sent by your visitors will be the .bit address, not the .onion or .b32.i2p address.  Example configurations are at d/federalistpapers (Tor) and d/anonymous-git-hosting (I2P).  UPDATE: TLS with Tor/I2P is broken due to an SNI issue.  Thanks to domob for reporting it.

## Building

Place Windows and Linux versions of namecoind and nmcontrol in the corresponding subfolders of the daemons folder.  (You can skip this step, but obviously it will then require the user to install namecoind and nmcontrol themselves).  Then run "make" from the "client" directory.  Easy, right?

## Known Bugs

1. In extremely rare cases, some .bit websites might not load; this is because nmcontrol doesn't yet support the entire .bit specification.  (Placing bounties might improve this situation.)  However, almost all major .bit websites should now be supported if using the latest nmcontrol.

## Donate

If you like FreeSpeechMe and want to show your support, you can donate at the following addresses:

* Bitcoin: 1JfNztz7GfcxPFXQTnxjco6HA53fg491FV
* Namecoin: N4hnrzpQAiwwYXjvMVfqeoenUsvjZNRifV

## Thanks to:

* Moxie Marlinspike and Mike Kazantsev for Convergence.
* phelix, the Namecoin Marketing and Development Fund, and virtual_master for supporting the TLS and Tor/I2P bounties.
* itsnotlupus for adding TLS to the .bit spec.
* khal for nmcontrol.
* khal and vinced for namecoind.
* Anyone else I forgot.
