# iPhone companion

A personal-use iPhone app with a SwiftUI shell and the real Instagram mobile website in WKWebView. It starts in Direct, saves the login in this app’s persistent WebKit store, and keeps Instagram’s conversation, attachment and media interface. Its login is independent of the Mac app and Safari.

Requires iOS 17 or newer. There are no third-party Swift dependencies, notifications, APNs registration, push entitlements, background modes, server or relay. The app does not request notification permission. Camera, microphone or photo access can be requested by WebKit only when using the website’s media features. Website login, challenges, two-factor authentication and recovery stay on Instagram’s allowed authentication routes; Facebook/other cross-site login is unsupported. Use direct Instagram credentials.

## Install on your iPhone

1. Install the full **Xcode** app on a Mac, launch it, accept the license and let it install the iOS platform components. Command Line Tools alone cannot build this app.
2. Open `ios/InstagramMessenger.xcodeproj` in Xcode. The `InstagramMessenger` scheme is shared and ready to select. The checked-in JavaScript resource means Node is not required to build/install.
3. Open **Xcode → Settings → Accounts**, add your Apple Account, then select the project → **InstagramMessenger target → Signing & Capabilities**. Enable **Automatically manage signing** and select your **Personal Team**. If the bundle identifier is unavailable, replace `com.tuliosouza.InstagramMessenger` with a unique identifier, such as `com.yourname.InstagramMessages`.
4. Connect and unlock your iPhone, accept **Trust This Computer** if prompted, and choose it as the run destination. Enable **Settings → Privacy & Security → Developer Mode** on the iPhone when Xcode requests it; restarting may be required.
5. Press **⌘R**. If the phone asks you to trust the developer certificate, open **Settings → General → VPN & Device Management**, select your developer entry and trust it. Reopen the app and sign in directly to Instagram.

A free Personal Team supports development installation on your own device; no paid Apple Developer membership is required for this workflow. Free development provisioning is temporary (commonly seven days); rerun from Xcode when it expires. Xcode reports the exact signing/account limitations. This project is not an App Store submission.

To try the simulator first, select an installed iPhone simulator and press **⌘R**. It does not require device signing. For a command-line simulator build after full Xcode is installed:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/InstagramMessenger.xcodeproj \
  -scheme InstagramMessenger -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

## Controls and recovery

The tray button opens the inbox. The compact menu reloads the current permitted page or resets the local session after confirmation. Reset deletes this app’s saved website login/data; it does not delete Instagram messages or affect the Mac login. When disconnected, a retry screen appears; it retries when the network returns or when you tap **Try Again**. Rate limiting and server errors provide a retry explanation. The native view respects the screen safe areas and keyboard resizing; dismiss the keyboard with an interactive scroll.

Global feed/Explore/Reels navigation is hidden when recognizable, including mobile bottom bars. Full-document navigation, server redirects and SPA routes are independently restricted to messaging/authentication. Unknown global controls may remain visible if Instagram changes its layout; unsafe destinations still cannot load in this app. Ordinary attachments and media resources retain WebKit’s normal handling. Website features unavailable in mobile WebKit remain unavailable here.

Explicit, real taps on public HTTPS links in a conversation are handed to iOS outside the wrapper. Instagram link shims are unwrapped and revalidated; scripts, synthetic clicks, local hosts, IP literals, credentials, custom schemes and nonstandard ports cannot request a browser launch. iOS normally uses the default browser but may follow its Universal Link preferences into an installed destination app. There is no public option in this standard URL handoff that forces every installed app’s Universal Link into a browser. Shared content never opens an unrestricted embedded browser.

The bundled focus script executes in the page world to guard History API transitions and suppress synthetic link clicks. It has no script-message handler or native bridge. Native navigation and URL observation independently enforce the embed allowlist. The app retains normal TLS certificate checks and WebKit security. It does not fetch messages through private Instagram APIs.

## Development and local verification

From the repository root, after `npm ci`:

```sh
node scripts/build-ios.js
node scripts/build-ios.js --check
node --test test/ios.test.js
```

`ios/focus-entry.js` bundles the existing `src/policy.js` and `src/focus.js`, then adds mobile navigation filtering, SPA guards and trusted-click filtering. Regenerate and commit `ios/InstagramMessenger/Resources/focus.js` whenever those inputs change. `--check` detects a stale resource without writing files.

The tests execute that exact bundled resource against DOM fixtures, compile/run the Foundation-only `NavigationPolicy.swift` with `ios/Tests/NavigationPolicyTests.swift`, resolve Xcode build inputs, parse all Swift source files, lint plists/project data and validate the shared scheme XML. They can run with macOS Command Line Tools. Swift syntax parsing does **not** type-check SwiftUI/UIKit/WebKit against the iOS SDK.

On the authoring machine, only `/Library/Developer/CommandLineTools` and Swift 6.3.3 were installed; no full Xcode/iOS SDK or signing identities were available. **No iOS compile, simulator run, device install or live Instagram session is claimed.** Open/build with full Xcode, then verify on an actual iPhone: direct login/2FA, relaunch persistence, thread opening/sending, photo upload, inline/shared media, external links, keyboard in portrait/landscape, offline recovery, and reset/cancel. Website-dependent behavior and Apple provisioning require those checks.

Apple references: [running an app on a device](https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device), [Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device), [membership options](https://developer.apple.com/support/compare-memberships/), [Universal Links](https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content).
