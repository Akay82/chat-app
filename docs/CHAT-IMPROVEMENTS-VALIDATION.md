# Chat improvements — 2026-11-01

Implemented all requested areas except attachment/photo sharing:

- Incremental keyword search over chat history, next/previous results, highlighted text, and jumps to original messages. Deleted text is excluded. Earlier history is loaded in pages of 40 rather than copied into another index.
- Visible Sending, Sent, Delivered, Read, failed and unconfirmed states. Retry keeps the original ID; Firestore transactions acknowledge existing messages without duplicating them or overwriting later edits.
- Message and incoming-call notifications with permission controls, a test button, service-worker display for compatible mobile browsers, click-to-chat routing, private system previews and optional sounds. Incoming alerts are dismissed when calls end.
- Visual-viewport keyboard sizing, safe-area spacing, larger mobile touch targets, an accessible actions menu, and deliberate swipe-to-reply with vertical-scroll/long-press rejection.
- Contact and group member/sender profile viewers, enlarged thumbnails, and block/unblock controls.
- A single signed-in offline banner plus account/chat-scoped sessionStorage recovery for drafts, replies and up to 20 unsent messages per chat. Recovery survives refresh/conversation switches in the same tab, and clears on sign-out/account changes. Editing an earlier message preserves the normal draft.

## Automated verification

- 72 unit/component tests passed across 13 files. New checks cover incremental search and jumps, deleted text, retry IDs, offline waiting/retry, recovered drafts/replies, draft preservation during edits, swipe intent, profile blocking, group receipt states, deterministic equal-timestamp ordering, account isolation/cleanup, keyboard viewport changes and notification cancellation/click routing.
- 25 Firestore/Realtime Database security tests passed against demo-gather emulators.
- 2 Firebase integration tests passed, expanded to retry an already-saved ID concurrently and verify that retries preserve the original creation timestamp and later edits.
- TypeScript, ESLint and production/PWA build passed. The generated service worker imports notification-events.js. The final unconfirmed-status refinement also passed the 17 affected behavior/component tests.

## Browser verification

Used only synthetic accounts/messages in isolated demo-gather emulators and an emulator-mode Vite server on port 5176. The live project and existing port 5173 were not used for test writes.

- Seeded 86 messages; a keyword outside the latest 40 was found after loading the next page. Clicking its result scrolled to the highlighted original; surrounding context remained present.
- Entered a draft and reloaded; the composer restored its contents.
- Opened the contact profile, enlarged its picture and blocked/unblocked the test contact. The draft remained intact.
- Forced a server rejection by blocking the sender from the other synthetic account. The failed message exposed Retry, survived refresh, and succeeded after unblocking. A server query verified exactly one message with the test content.
- Updated the synthetic peer's receipt and confirmed Read labels rendered.
- Checked 390 × 844 and 320 × 420 layouts. At 320 × 420, the composer bottom was approximately 412 px, document width stayed at 320 px, and search left about 101 px of message context without horizontal overflow. This simulates reduced keyboard space; physical iOS/Android keyboards were not tested. Viewport was reset afterward.
- Verified notification settings and their open-app delivery limitation were visible. Notification APIs/click handling were tested with mocks and the actual worker script; actual operating-system notification delivery was not exercised.

Screenshots: [desktop search](chat-search-preview.png), [mobile search](chat-mobile-preview.png).

## Limits and deployment

No new Firebase rules, indexes, fields, paid service or attachment storage are needed. Searching earlier history uses normal Firestore reads, and transactional sends add a document read. Drafts/outbox stay in browser sessionStorage and do not create database documents. Closing the tab, clearing browser storage or signing out can remove recovery data; it is not a durable/cross-device outbox. Existing online history is memory-cached, not durably cached for offline reloads.

Notifications require browser permission, support and a connected running page. Closing/suspending the app can stop message/call listeners; no closed-app push backend was added. Mobile notifications use [ServiceWorkerRegistration.showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification); click routing follows the [notificationclick event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event). Keyboard sizing uses the [Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport). Actual device delivery and keyboard behavior remain hardware validation tasks.
