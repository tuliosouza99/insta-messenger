# Testing

Use Node.js 24+ and `npm ci`.

```sh
npm run check          # Build the sandbox preload and run JavaScript unit/DOM tests
npm run test:desktop   # Actual Electron renderer integration tests
npm run test:ios       # Experimental iPhone policy/resource/project checks
npm run check:all      # All of the above
```

The GitHub workflow runs the JavaScript checks and validates the checked-in iPhone JavaScript resource on Linux. Desktop integration tests exercise macOS window behavior and require a macOS graphical session. The iPhone checks compile a Foundation-only policy using Apple's Swift tools, validate project resources and parse Swift syntax; they do not compile the SwiftUI/WebKit app against an iOS SDK.

Desktop tests use isolated temporary profiles, intercept HTTPS before the first page navigation and stub native banner delivery. They do not connect to an Instagram account, send messages, view stories or access the ordinary app profile. The native notification controller, generic copy, focus behavior, toggle persistence and close-versus-quit behavior have automated coverage; actual OS permission/banner delivery is a separate manual check.

Before releasing a Mac build:

1. Run `npm run check` and `npm run test:desktop`.
2. Run `npm run package` and verify the package's ad-hoc signature.
3. Launch the package and sign in yourself to check the current Instagram UI.
4. Check inbox/thread Back navigation, the story control, shared/external links, media and offline retry.
5. Use **Notifications → Send test notification** and verify macOS delivery.

Website-dependent behavior can change independently of this source. The unread detector uses title counts and explicit accessible markers, so it does not guarantee an alert for every message. A message in an already-unread thread may not change those signals. Story playback and login can also depend on the account and available content.

Never include account cookies, browser profiles, credentials, private messages or real-contact screenshots in issues, test fixtures or release packages. Use synthetic fixtures when reporting UI problems.
