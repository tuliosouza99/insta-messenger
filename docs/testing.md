# Testing

Use Node.js 24+ and `npm ci`.

```sh
npm run check          # Build the sandbox preload and run JavaScript unit/DOM tests
npm run test:desktop   # Actual Electron renderer integration tests
npm run check:all      # Unit and macOS integration checks
```

The GitHub workflow runs the JavaScript checks on Linux. Desktop integration tests exercise macOS window behavior and require a macOS graphical session.

Desktop tests use isolated temporary profiles, intercept HTTPS before the first page navigation and stub native banner delivery. They do not connect to an Instagram account, send messages, view stories or access the ordinary app profile. The native notification controller, generic copy, focus behavior, toggle persistence and close-versus-quit behavior have automated coverage; actual OS permission/banner delivery is a separate manual check.

Before packaging a local Mac app:

1. Run `npm run check` and `npm run test:desktop`.
2. Run `npm run package` and verify the package's ad-hoc signature.
3. Launch the package and sign in yourself to check the current Instagram UI.
4. Check inbox/thread Back navigation, the story control, shared/external links, media and offline retry. Open a received photo, video, shared post and Reel; check playback, Back/Escape, preserved draft/scroll position and absence of onward browsing.
   Open the top-right Notifications bell and check new-follower and accepted-request activity, including from a standalone inbox without a global navigation rail. Close and reopen the panel, confirm the current draft remains, and check that feed/Explore/Reels navigation stays hidden. Check Back/Escape and offline recovery in the focused activity view. This activity should not create desktop alerts.
5. Use **Notifications → Send test notification** and verify macOS delivery.

Website-dependent behavior can change independently of this source. The unread detector uses title counts and explicit accessible markers, so it does not guarantee an alert for every message. A message in an already-unread thread may not change those signals. Story playback and login can also depend on the account and available content.

Attachment tests use synthetic posts and a generated two-second solid-color MP4, including actual MediaSource playback. They cover message-scoped activation, button-based shared Reels, native streaming initialization, poster visibility, lazy carousel navigation, canonical post identity, late image sizing, isolation, denied onward navigation, Back/Escape, draft preservation, offline recovery, resizing and disposal. Live Instagram verification complements these fixtures because account-specific markup can change independently.

Never include account cookies, browser profiles, credentials, private messages or real-contact screenshots in issues, test fixtures or release packages. Use synthetic fixtures when reporting UI problems.
