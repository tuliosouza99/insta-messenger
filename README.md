# Instagram Messenger

An unofficial macOS app for Instagram messages, with less browsing around them. Sign in directly to Instagram, open your inbox, and keep conversations and stories in a focused desktop window.

Independent project. Not affiliated with or endorsed by Instagram or Meta.

## Build from source

Requires macOS, Git, Node.js 24+ and npm. Apple Silicon is the tested platform; Intel Mac, Windows and Linux builds have not been verified.

```sh
git clone https://github.com/tuliosouza99/insta-messenger.git
cd insta-messenger
npm ci
npm run package
open "dist/Instagram Messenger-darwin-$(node -p process.arch)/Instagram Messenger.app"
```

Packaging targets the current machine's OS and architecture; the command above opens the app for the current Mac architecture. It creates and verifies a local ad-hoc signature. To run the development window instead, use `npm start`; native notification delivery should be checked in the packaged app.

Sign in directly with your Instagram username and password. Facebook-linked sign-in is not supported in this version.

```sh
npm run check          # Preload build and JavaScript unit/DOM checks
npm run test:desktop   # Actual Electron integration tests on macOS
npm run check:all      # Unit and macOS integration checks
```

See [testing and local packaging checks](docs/testing.md). GitHub CI runs the JavaScript checks; macOS integration and native notification delivery have separate local checks.

## Features

- Opens directly to your inbox and remembers your login in a dedicated local profile.
- Keeps Instagram's own conversation list, group chats and composer where supported by its website.
- Opens recognized message photos, videos, shared posts and Reels in a focused attachment viewer. Reels retain Instagram's streaming player, and carousel arrows move through photos in the selected post. **Back to message** (or Escape) returns to the conversation with your draft and place preserved; the viewer cannot browse other posts, profiles or recommendations.
- Hides recognized feed/Explore/Reels navigation and redirects attempted browsing back to messages.
- Keeps the conversation Back arrow inside the app.
- Adds a **Notifications** bell in the top-right corner of messages. It opens Instagram's own activity panel, including new followers and accepted follow requests, while keeping your conversation and draft in place. Standalone inbox layouts open activity in a separate focused view; **Back to messages** or Escape returns to the inbox.
- Adds **View story** to recognized conversation headers. Story links stay inside the app and return to the last conversation when closed. Instagram determines whether a story is available.
- Opens profiles, other public HTTPS links and post/Reel links outside recognized conversation messages in the normal browser.
- Shows generic native alerts for new unread activity without message or sender previews.
- Keeps the inbox running when its window is closed. Clicking an alert reopens it; **Quit** exits.
- Provides offline retry, native Edit/View/Window menus, zoom, and confirmed local session reset.

Useful controls:

| Control | Action |
| --- | --- |
| `⌘1` | Return to inbox |
| `⌘R` | Reload |
| Notifications bell in messages | Open or close Instagram's in-app activity panel |
| Notifications → Message notifications | Enable or disable alerts; preference is saved |
| Notifications → Send test notification | Check native macOS delivery |
| Instagram Messenger → Reset Instagram session… | Clear this app's cookies/cache/site storage after confirmation |

Allow the app in **System Settings → Notifications** if macOS requests permission. Delivery requires an awake, online Mac and a signed-in app. Webpage notification, camera and microphone permissions remain denied; the app posts its own native alerts.

## Limitations

Instagram can change its website markup and routing without notice. Unknown layouts are preserved rather than hidden broadly, so visual filtering may need updates. URL guards remain active.

Alerts follow increases in Instagram's unread title counts or explicit accessible markers. Startup backlog is ignored, foreground activity is suppressed and short bursts are grouped. A message in an already-unread thread may not change the count. This is not an independent push service or a guarantee of an alert for every message.

The in-app activity bell remains available in standalone inbox layouts without global navigation. The focused activity view recognizes Instagram's English, Portuguese and Spanish Notifications panels and keeps its home feed hidden. Activity contents and updates come from Instagram's website; follow activity does not create macOS notifications. Profiles opened from the activity panel use your normal browser.

Calls, camera/microphone access, account switching, tray behavior, dock unread badges and automatic updates are not implemented. File upload pickers remain part of Instagram's interface; downloads ask before opening the browser.

This wrapper uses Instagram's website. It does not use an unofficial messaging API or a business-account API, and it cannot guarantee account-specific login, messaging, media or story availability. The attachment viewer shows recognized media from the selected message/post; private, unavailable or unsupported layouts offer a return to the message instead of broader Instagram browsing.

## Privacy and security boundaries

There is no app backend, analytics service, app-owned password form, or server-side message collection. Instagram handles its own traffic under its normal policies. Cookies, cache and website data stay in this app's local browser profile, separate from your ordinary browser. On macOS it normally lives under `~/Library/Application Support/Instagram Messenger/Partitions/instagram-messenger`.

Instagram runs in a sandboxed Electron renderer with Node integration disabled, context isolation enabled and browser security enabled. Website scripts receive no native bridge. The main process validates private IPC senders and destinations, denies new windows and device permissions by default, and validates external links. The app-owned recovery page gets only narrow retry/inbox actions.

Packaging copies application source, UI assets, a bundled preload, a minimal manifest and the license. It excludes browser profiles, credentials, tests, development dependencies and Git history. Test fixtures use synthetic data and temporary profiles.

Please remove private messages, contact details, cookies and tokens from bug reports and screenshots.

## Contributing

Use synthetic fixtures for bug reproductions, run the relevant checks, and keep native capabilities narrow. Include the app version, macOS version and steps to reproduce in issues. Website-dependent fixes should preserve login, chat content and navigation guards.

## License

[MIT](LICENSE), copyright 2026 Túlio Souza. Electron, Chromium and other dependencies retain their own licenses and notices.
