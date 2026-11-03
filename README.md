# Instagram Messenger

An unofficial macOS app for Instagram messages, with less browsing around them. Sign in directly to Instagram, open your inbox, and keep conversations and stories in a focused desktop window.

Independent project. Not affiliated with or endorsed by Instagram or Meta.

## Download

[Experimental macOS Apple Silicon release](https://github.com/tuliosouza99/insta-messenger/releases/tag/v0.2.1)

The prebuilt app targets Apple Silicon Macs. It is **ad-hoc signed, not Developer ID signed or notarized**; macOS may block a downloaded copy. Building from source is an alternative. Windows, Linux and Intel Mac builds have not been verified.

The release archive includes the app and its project/Electron/Chromium license notices. Extract it and open **Instagram Messenger.app**. Sign in with your Instagram username and password; Facebook-linked sign-in is not supported in this version.

## Features

- Opens directly to your inbox and remembers your login in a dedicated local profile.
- Keeps Instagram's own conversation list, group chats, composer and in-conversation media where supported by its website.
- Hides recognized feed/Explore/Reels navigation and redirects attempted browsing back to messages.
- Keeps the conversation Back arrow inside the app.
- Adds **View story** to recognized conversation headers. Story links stay inside the app and return to the last conversation when closed. Instagram determines whether a story is available.
- Opens shared posts, Reels, profiles and other public HTTPS links in the normal browser.
- Shows generic native alerts for new unread activity without message or sender previews.
- Keeps the inbox running when its window is closed. Clicking an alert reopens it; **Quit** exits.
- Provides offline retry, native Edit/View/Window menus, zoom, and confirmed local session reset.

Useful controls:

| Control | Action |
| --- | --- |
| `⌘1` | Return to inbox |
| `⌘R` | Reload |
| Notifications → Message notifications | Enable or disable alerts; preference is saved |
| Notifications → Send test notification | Check native macOS delivery |
| Instagram Messenger → Reset Instagram session… | Clear this app's cookies/cache/site storage after confirmation |

Allow the app in **System Settings → Notifications** if macOS requests permission. Delivery requires an awake, online Mac and a signed-in app. Webpage notification, camera and microphone permissions remain denied; the app posts its own native alerts.

## Limitations

Instagram can change its website markup and routing without notice. Unknown layouts are preserved rather than hidden broadly, so visual filtering may need updates. URL guards remain active.

Alerts follow increases in Instagram's unread title counts or explicit accessible markers. Startup backlog is ignored, foreground activity is suppressed and short bursts are grouped. A message in an already-unread thread may not change the count. This is not an independent push service or a guarantee of an alert for every message.

Calls, camera/microphone access, account switching, tray behavior, dock unread badges and automatic updates are not implemented. File upload pickers remain part of Instagram's interface; downloads ask before opening the browser.

This wrapper uses Instagram's website. It does not use an unofficial messaging API or a business-account API, and it cannot guarantee account-specific login, messaging, media or story availability.

## Build from source

Requires macOS, Node.js 24+ and npm.

```sh
git clone https://github.com/tuliosouza99/insta-messenger.git
cd insta-messenger
npm ci
npm run package
open "dist/Instagram Messenger-darwin-arm64/Instagram Messenger.app"
```

Packaging targets the current machine's OS and architecture; the command above shows the Apple Silicon output. It creates and verifies a local ad-hoc signature. To run the development window instead, use `npm start`; native notification delivery should be checked in the packaged app.

```sh
npm run check          # Preload build and JavaScript unit/DOM checks
npm run test:desktop   # Actual Electron integration tests on macOS
npm run test:ios       # Experimental iPhone source/project checks
npm run check:all      # All available checks
```

See [testing and release checks](docs/testing.md). GitHub CI runs the JavaScript checks and validates bundled resources; macOS integration and native notification delivery have separate local checks.

## Privacy and security boundaries

There is no app backend, analytics service, app-owned password form, or server-side message collection. Instagram handles its own traffic under its normal policies. Cookies, cache and website data stay in this app's local browser profile, separate from your ordinary browser. On macOS it normally lives under `~/Library/Application Support/Instagram Messenger/Partitions/instagram-messenger`.

Instagram runs in a sandboxed Electron renderer with Node integration disabled, context isolation enabled and browser security enabled. Website scripts receive no native bridge. The main process validates private IPC senders and destinations, denies new windows and device permissions by default, and validates external links. The app-owned recovery page gets only narrow retry/inbox actions.

Packaging copies application source, UI assets, a bundled preload, a minimal manifest and the license. It excludes browser profiles, credentials, tests, development dependencies and Git history. Test fixtures use synthetic data and temporary profiles.

Please remove private messages, contact details, cookies and tokens from bug reports and screenshots.

## Experimental iPhone source

The `ios/` folder contains a separate SwiftUI/WKWebView prototype for iOS 17+, with independent login and **no notifications or relay**. iPhone development is currently deferred.

The Foundation URL policy and bundled JavaScript have checks, and project/plist/scheme integrity and Swift syntax are validated. This does **not** establish a successful iOS SDK build or device run. Full Xcode, its iOS platform support and a personal signing setup are required. No installable iPhone binary is included.

See [iPhone project and setup](ios/README.md).

## Contributing

Use synthetic fixtures for bug reproductions, run the relevant checks, and keep native capabilities narrow. Include the app version, macOS version and steps to reproduce in issues. Website-dependent fixes should preserve login, chat content and navigation guards.

## License

[MIT](LICENSE), copyright 2026 Túlio Souza. Electron, Chromium and other dependencies retain their own licenses and notices.
