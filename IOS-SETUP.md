# Lance on iPhone (Capacitor wrapper)

One time, on the Mac (needs Xcode from the App Store and Node):

1. git clone https://github.com/devonortiz-design/Lance-.git && cd Lance-
2. npm install
3. npm run build
4. npx cap add ios
5. In ios/App/App/Info.plist add two keys (Xcode: open the file, press + ):
   - NSMicrophoneUsageDescription = Lance listens when you talk to him.
   - NSSpeechRecognitionUsageDescription = Lance turns your speech into text.
6. npm run ios:sync
7. npm run ios:open  (opens Xcode)
8. In Xcode: click App on the left, then Signing & Capabilities. Pick your Team (your Apple Developer account). Bundle Identifier: org.vbcfremont.lance
9. Plug in the iPhone, pick it at the top, press the Play button. First launch: Settings > General > VPN & Device Management > trust yourself.

After any change to Lance: git pull, npm run ios:sync, press Play again.

TestFlight (so it installs without a cable and lasts 90 days per build):
Xcode > Product > Archive > Distribute App > App Store Connect > Upload. Then add yourself as an Internal Tester in App Store Connect.

Phase 2 (not done yet): native push alerts through Apple (APNs). The web alert card is hidden inside the app until then.
