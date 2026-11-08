# Personal iPhone app

Date: 2026-11-08
Status: proposed for user review

## Intent

Give Túlio a focused Instagram inbox on his own iPhone, installed through Xcode. The user confirmed personal use only and no App Store distribution. Preserve the current app's website-based approach and direct Instagram sign-in rather than introducing a new messaging service.

The first milestone is an app that actually compiles and launches in the installed iPhone simulator, plus a project ready for signing and installation on the user's phone. Successful account login and sending are verified by the user on the real Instagram website, not asserted from fixtures.

## Existing evidence

- The current desktop app is Electron; `src/main.js` owns native navigation, session storage and recovery, while `src/policy.js` and `src/focus.js` implement website routing and focus behavior.
- There is no current iOS directory. Commit `7301d98` contains a SwiftUI/WKWebView prototype; `99be3f3` removed it when distribution became source-only. Use this as a candidate foundation and review it against current code rather than blindly reverting the removal commit.
- That prototype had native policy, session/reset/retry controls, mobile navigation filtering, an Xcode project, a bundled focus script and synthetic tests. Its documentation explicitly said it had never been built against an iOS SDK.
- Full Xcode, the iOS SDK and iPhone simulators are now available through `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`. Commands succeed without the earlier license error. Avoid changing the machine's global developer directory.
- The working tree contains ongoing desktop activity-viewer changes. Preserve them and keep iOS work scoped to new files and necessary additive build/documentation edits.

## Approaches

### Recommended: SwiftUI shell with WKWebView

This follows the existing website-based product, reuses browser JavaScript where appropriate, and provides native iPhone session and recovery controls with no third-party Swift packages. Revisit the old prototype rather than starting from an empty template. Instagram still controls account access and which messaging/media features work in mobile WebKit.

### Capacitor or another cross-platform web shell

This could package a local web UI, but the product currently embeds Instagram and has no local chat frontend to reuse. It would add a runtime and plugin layer while still requiring iOS navigation/session integration. It offers little benefit for this personal iPhone target.

### Native chat screens with a messaging API

This would require a separate, supported messaging integration and a much larger product change. It does not follow the existing website-wrapper model and is outside this milestone.

The implementation proposal is the SwiftUI/WKWebView approach. Framework and milestone details below are builder recommendations; only personal use and no App Store release were explicitly selected by the user.

## First-version behavior

1. Open Instagram Direct on launch. Render Instagram's mobile login, 2FA/challenge and messaging interfaces inside WKWebView. Do not collect credentials in native controls.
2. Persist the app's WebKit website data across relaunches, independently of Safari and the Mac app. Do not sync cookies between devices.
3. Keep the website's inbox, thread list, composer, group chats, inline media and attachment picker usable where Instagram exposes them. Native safe areas and keyboard resizing must keep the composer reachable in portrait and landscape.
4. Hide recognized mobile feed/Explore/Reels navigation while leaving conversation content, media and ambiguous elements intact. Enforce allowed routes natively for full-page loads and same-document transitions; visual hiding alone is insufficient.
5. Allow only messaging and the existing recognized Instagram authentication routes inside the main web view. Handle post-login redirects to Instagram home by returning to Direct, with a bounded loop guard and recovery message.
6. Open validated public HTTPS links from real user taps in conversations through iOS's standard external URL handling. Shared posts, Reels, profiles and story links use this same external handling in the first milestone. iOS may choose an installed destination app through Universal Links.
7. Provide compact native inbox, reload and session-reset controls. Reset requires a confirmation and clears only this app's website session. Stop and detach the active page before erasing data, then recreate a configured web view.
8. Show native recovery for offline/network failures, a terminated web process, rate limiting/server errors and unsupported cross-site sign-in. Offer retry and return to inbox. Automatic retry after network reconnection must not interrupt a healthy conversation or discard an active draft.

## Boundaries

- Personal iPhone installation through Xcode; no App Store, TestFlight, hosted distribution or deployment work.
- iPhone target, minimum iOS 17 proposed; no iPad-specific interface or Mac Catalyst target.
- No backend, analytics, private Instagram API, server-side scraping, cookie relay or message storage outside WebKit.
- No notification permission request, APNs setup, background polling or claim of background delivery. The app resumes its web session when brought back to the foreground.
- No calls, voice recording or new camera/microphone integrations. Existing photo/video attachment selection can use the website's picker; add only usage descriptions actually required for supported paths. Do not claim these features work before device verification.
- Direct Instagram sign-in only. Unsupported Facebook/cross-site login must explain the limitation without granting a general-purpose embedded browser.
- Desktop activity panels, story controls and focused shared-post/Reel viewers are future parity work. Do not silently import their Electron plumbing.
- Preserve standard TLS/WebKit security. Reject custom URL schemes, credentials in URLs, unsafe hosts and malformed destinations. Subframes must never acquire a path to launching native apps.
- Avoid a general native JavaScript bridge. Browser-only filtering may execute in the page world for History API interception; native route checks remain authoritative. Document that page scripts can change the DOM and JavaScript filtering is best effort.

## Components and repository changes

- `ios/InstagramMessenger.xcodeproj`: shared scheme, iPhone build settings, app sources and bundled resource. Automatic signing remains configurable by the user's own Apple account; do not hard-code a discovered team or copy credentials.
- `ios/InstagramMessenger/InstagramMessengerApp.swift` and `MessengerView.swift`: app entry, a retained web session, small toolbar, loading/recovery state and reset confirmation.
- `ios/InstagramMessenger/WebSession.swift`: persistent WKWebView lifecycle, navigation and response delegates, same-document URL observation, external-link validation, reset and network recovery. Keep the web view stable across ordinary SwiftUI updates.
- `ios/InstagramMessenger/NavigationPolicy.swift`: Foundation-only classification and navigation decisions, matching the shared JavaScript policy on supported routes and unsafe URL cases.
- `ios/focus-entry.js` and a mobile-specific interactions helper: reuse pure existing focus/policy modules and add conservative mobile filtering and route handling. Do not import Electron APIs.
- `scripts/build-ios.js` and a bundled `Resources/focus.js`: reproducible browser bundle, checked in so building in Xcode does not require Node. A check mode detects stale output; add an explicit npm command without changing what desktop packaging copies.
- Focused DOM/native tests and `ios/README.md`: describe actual validation, direct login, local build/run, signing configuration and remaining device checks. Link the iPhone instructions from the root README without rewriting desktop work.

## Verification and completion criteria

1. Run existing JavaScript checks to establish a baseline, then test mobile focus and native policy behavior. Cover mobile navigation hydration, legitimate thread/auth transitions, feed/Explore/Reels rejection, external-link activation, unsafe/synthetic links, post-login redirects and bounded recovery. Use synthetic content, not account data.
2. Verify the bundled JavaScript is current and the Xcode project resolves its sources/resources. Compile the real app against the installed iOS Simulator SDK; Swift syntax parsing alone is not completion.
3. Boot an installed iPhone simulator, install and launch the app, and inspect the rendered shell and login/recovery state. Where useful, use deterministic WebKit fixtures to verify native integration without logging into a real account. Do not send a real message or sign into the user's account automatically.
4. Run existing desktop checks appropriate to any touched shared code, retaining unrelated local edits. Build the desktop preload if npm/build files change.
5. Supply the Xcode project and concise device instructions. The user selects their Apple account/team and authorizes phone trust/Developer Mode in Apple UI as required. If signing or hardware access prevents installation, report that exact remaining step; do not label a simulator run as a device run.
6. Device acceptance checklist: direct login and 2FA, persistence after relaunch, opening a thread, sending a user-chosen message, attachment selection, keyboard/orientation, external links, offline/reconnect recovery and reset/cancel. Report website/account-dependent behavior as unverified until observed.

## Calls left to the builder

Choose Swift concurrency annotations compatible with the installed SDK, the smallest project fixes needed to compile the prototype, deterministic fixture mechanics, and unobtrusive native labels/layout. Fix bugs found in the inherited prototype and add focused regression coverage where behavior changes. Keep initial testing proportional; do not add unrelated infrastructure or ship extra features to satisfy fixtures.

## Failure conditions

Do not call this complete if it only passes JavaScript tests, never builds with the real iOS SDK, opens a browsing feed inside the app, loses the session on ordinary relaunch, hides the composer or messages, claims background notifications, or overwrites the user's ongoing desktop changes. A simulator build and launch can complete the implementation milestone while real-account/device acceptance remains explicitly outstanding.
