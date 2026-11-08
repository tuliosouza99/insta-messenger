# IG Messages for iPhone

This companion app opens Instagram Direct in a SwiftUI window with the Instagram mobile website inside it. It keeps the sign-in session in local WebKit storage and hides recognized feed, Explore and Reels navigation. It requires iOS 17 or later and is installed directly from Xcode for personal use.

## Install from Xcode

1. Open `ios/InstagramMessenger.xcodeproj` in Xcode. Select the **InstagramMessenger** scheme.
2. In **Xcode → Settings → Apple Accounts**, sign in with your Apple Account. Under the app target's **Signing & Capabilities**, enable automatic signing and choose your **Personal Team** or developer team. If Xcode reports a bundle identifier conflict, set a unique identifier.
3. Connect and unlock your iPhone. Accept the trust prompt and select the phone as the run destination. Enable **Settings → Privacy & Security → Developer Mode** if Xcode prompts you to do so.
4. Press **⌘R**. On your iPhone, open **IG Messages** and sign in directly with your Instagram credentials. Your iPhone session is independent of Safari and the Mac app.

With a free Personal Team, Apple development profiles expire after seven days. Run the project on your phone again from Xcode to renew the installation. [Apple's Personal Team documentation](https://developer.apple.com/help/account/basics/about-your-developer-account/)

[Run an app on a device](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices) · [Enable Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device/)

## Using the app

The tray button returns to Direct. The menu reloads the current page or clears this app's Instagram website data after confirmation. An offline failure offers **Try Again** and can retry when the connection returns.

Instagram provides the conversation list, composer, inline media and attachment picker. Availability depends on its mobile website. Tapping a shared post, Reel, story, profile or other public link in a conversation hands it off to iOS. The system may use your browser or an installed app. Background message alerts and the desktop attachment and activity viewers are deferred.

## Build and verify

Select an iPhone simulator in Xcode and press **⌘R**. The bundled browser scripts let Xcode build without Node. A command-line build from the repository root is also available:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/InstagramMessenger.xcodeproj \
  -scheme InstagramMessenger -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

After `npm ci`, run `npm run build:ios` to regenerate the bundled scripts when iOS or shared focus/policy JavaScript changes. Run `npm run test:ios` on a Mac to check the generated resource and run the synthetic DOM and Swift navigation tests.

On a physical iPhone, check Instagram sign-in and any 2FA prompts, relaunch persistence, opening a thread, sending a message, media attachments, external links, keyboard layout, retry and session reset. The simulator can verify the shell and unauthenticated website without using your account.
