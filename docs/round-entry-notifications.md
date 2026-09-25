# Round entry and notifications

The September 24 change addresses failed topic saves that looked successful, match retry dialogs that reopened and chimed again, suspended sound effects, and notification clicks that could navigate an unrelated active call away.

- The primary round action comes before the collapsed sound/notification controls. Existing microphone, call audio and reconnect controls keep their handlers.
- Topic proposals use the native dialog top layer, adapt to the visual viewport, and keep editable text on failed saves. Duplicate submission is disabled while saving. The proposal still needs the other participant's acceptance; saving never replaces an agreed topic by itself.
- Match acceptance recovery keeps the dialog element and original deadline. Opening its OS notification returns to the invitation without accepting it.
- `notification-setup.js` uses the existing account registration and preference APIs. Permission is requested directly from the enable button. Successful registration enables match/message delivery. Broadcasts about anyone entering the queue require a separate checkbox. No account or browser permission is enabled on behalf of a user.
- The Notifications page, waiting queue and room each expose device setup, a test notification, a sound test, mute and phone instructions. Registration failure and denied permission remain visible.
- `daShowDeviceNotification` prefers `ServiceWorkerRegistration.showNotification`, with the desktop constructor as fallback. The service worker focuses an existing exact destination or opens a new tab, preserving other calls. Off-origin destinations are rejected.
- SFX recovers suspended/interrupted contexts on later gestures. Explicit mute stops pending tones. Notification cues remain available with reduced motion, while decorative cues keep their existing policy. Alerts older than three seconds do not queue against a frozen audio clock.

Phone behavior follows [WebKit's Home Screen push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple's web-app setup](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios), and [MDN's mobile notification guidance](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API). Operating-system permission, focus settings and volume remain controlled by the person using the device.

Verification includes browser fixtures at phone and desktop widths, real browser Web Audio unlock, permission/subscription/provider boundaries, retry preservation, matching consent, and service-worker click routing. The browser tests intercept account/device registration and notification delivery; they do not establish receipt on a physical phone or test a real two-person call. The production registration configuration was checked read-only.

Run `node scripts/test-notification-delivery.mjs`, `node scripts/test-live-alert-setup.mjs` and `e2e/tests/round-entry-notifications.spec.mjs`, alongside the existing room panel, cleanup and match invitation suites.

## 2026-09-25: real delivery test

The setup panel now calls authenticated `/api/push-test`. It sends fixed test copy
only to the caller's browser and native registrations, with 2/minute and 10/day
limits. No recipient or content is accepted from the client. The result reports
provider acceptance, not a claim that a banner was displayed. The button is also
available inside native iOS/Android apps, where `window.Notification` is absent.
Apple's 400 VapidPkHashMismatch/BadJwtToken responses now count as stale-key
rejections so the test can recommend registration again.
