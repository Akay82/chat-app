# Gather · A little closer

A responsive React 19 messaging PWA with Firebase Authentication, private and group Firestore conversations, Realtime Database presence and native one-to-one WebRTC voice/video calling. Built for Netlify static hosting plus a small TypeScript health function. No Firebase Cloud Functions, Admin SDK, Storage bucket, paid API or continuous server is required.

## Run it

Use Node 24 LTS and npm. Java 21+ is needed only for the Firebase emulators.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill .env.local using your Firebase web app configuration.
npm run dev
```

Without credentials, the app displays connection instructions. It never substitutes fabricated users or messages. The checked-in `.env.emulator` contains **local demo-project identifiers**, not production credentials. To run the actual app without a Firebase account:

```powershell
# Terminal 1; Java must be on PATH
npm run emulators
# Terminal 2
npm run dev:emulator
```

Register two disposable accounts, complete their profiles and search by exact username. Emulator data is transient unless you explicitly export it. Do not expose the emulator ports publicly. Emulator mode explicitly overrides `.env.local` with `.env.emulator`, so local production credentials cannot redirect these tests to your live project. All `VITE_USE_EMULATORS=true` connections use loopback.

## What is implemented

- Email registration/login, Google popup login, password reset, email verification, persistent Firebase Auth sessions, protected chat routes, validated forms and friendly errors.
- Required profile onboarding; transactional unique usernames; display name, bio, six bundled avatar colors with initials, optional profile photos with crop/zoom and removal; discovery and presence privacy; blocking/unblocking and account deletion.
- Exact username discovery without user-list queries or exposed emails. Deterministic private chat IDs, real listeners, server timestamps, 40-message pagination, optimistic pending messages, retry, replies, editing, deletion tombstones, copy, emoji, per-user reactions and safe HTTP(S) links.
- Sent acknowledgments, delivered/read receipts for users who open a conversation, and aggregate unread message badges. Personal conversation hiding, incremental history search with highlighted matches and jump navigation, date separators, scroll-to-latest, typing expiry and reconnect UI.
- Groups of up to 20 people; creation, name/description, initials avatars, membership list, add/remove, admin transfer, leave, shared messaging/reactions/replies. Rules enforce administration.
- Private WebRTC offer/answer and trickled ICE signaling; incoming modal while open, accept/reject/hangup, ring/connect timeouts, call history, microphone/camera toggles, camera switching where available, local preview, remote stream and elapsed time. Media teardown and listener cleanup.
- Optional Realtime Database presence with `onDisconnect`, visibility tracking and last-seen privacy.
- Light/dark/system themes, responsive two-panel desktop UI and single-panel mobile navigation, native dialog focus handling, toast feedback, skeletons and empty/error states.
- Browser notifications for messages and incoming calls while Gather is open and connected; mobile-compatible service-worker display, click-to-chat routing, optional sounds, permission/test UI, and private system previews.
- Install manifest, generated PNG icons, Workbox app-shell caching, install prompt, offline banner and user-controlled new-version update prompt.
- Optional `AttachmentStorage` TypeScript interface plus image, audio and file display components. Uploads are unavailable in the default app and explain why. A provider implementation and wiring are required to enable them.

## Firebase setup and deployment checklist

1. Create a Firebase project on **Spark**. Do not attach billing or create a Storage bucket. Register a Web app and copy its configuration from Project settings.
2. Under Authentication → Sign-in method, enable Email/Password and Google. Set the Google support email. Email/password strength is checked in the client; configure an appropriate Auth password policy as well.
3. Create **Cloud Firestore in production mode** in your chosen region. The app uses the default database.
4. Optionally create Realtime Database in locked mode. Copy its exact regional database URL to `VITE_FIREBASE_DATABASE_URL`. Leaving this blank disables presence; messaging and calls still work.
5. Add the public `VITE_FIREBASE_*` identifiers to `.env.local`. Copy names exactly from `.env.example`. Never put Admin keys or long-lived TURN secrets in a `VITE_` variable; Vite embeds these values in public JavaScript.
6. Authenticate the Firebase CLI and deploy rules/indexes to your actual project:

   ```powershell
   npx firebase login
   npx firebase deploy --only firestore:rules,firestore:indexes,database --project YOUR_PROJECT_ID
   # If not using RTDB, omit ,database.
   ```

7. Wait for the indexes in `firestore.indexes.json` to become ready. Test with two real accounts before publishing broadly. Never replace rules with test-mode allow-all rules.
8. Create a GitHub repository from this folder and push the source plus `package-lock.json`. Do not commit `.env.local`, `.tools`, emulator exports or service credentials.
9. In Netlify, import the repository. `netlify.toml` sets `npm run build`, `dist`, Node 24 and the TypeScript functions directory. Use the free `netlify.app` subdomain.
10. Enter the public Firebase identifiers under Netlify environment variables **before building**. Leave `VITE_USE_EMULATORS` unset/false. Redeploy whenever build-time values change.
11. Add the exact Netlify hostname to Firebase Authentication → Settings → Authorized domains. Add `localhost` explicitly if needed for local Google login. Preview hostnames require authorization too.
12. Open the HTTPS deployment, test a refreshed `/chat/ID` route, and visit `/api/health`. Netlify's API redirect precedes its SPA fallback.
13. Run the manual checklist below. Install from the browser menu or install banner. Safari/iOS uses Share → Add to Home Screen. Installation availability varies by browser.

No cloud project, production credentials, repository, Netlify site or billing configuration was created during local development. Deployment and real-device media verification remain external steps.

## Environment variables

| Variable                            | Purpose                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`             | Public Firebase Web API key                                    |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Firebase Auth redirect domain                                  |
| `VITE_FIREBASE_PROJECT_ID`          | Actual project ID                                              |
| `VITE_FIREBASE_APP_ID`              | Web app ID                                                     |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Optional public sender identifier; push sending is not enabled |
| `VITE_FIREBASE_DATABASE_URL`        | Optional RTDB URL for presence                                 |
| `VITE_USE_EMULATORS`                | Local-only switch; never true in production                    |
| `VITE_ICE_SERVERS`                  | JSON `RTCIceServer[]`; defaults to `[]`, host candidates only  |

There are no required server secrets. The health endpoint is public and does not perform privileged operations. A VAPID key alone would not deliver notifications: no FCM worker/token registration or trusted push sender is included, so no unused VAPID variable is advertised.

## Architecture and schema

The browser talks directly to Firebase under security rules. Zustand stores only appearance/notification preferences, React Hook Form/Zod validate inputs, TanStack Query caches public profile lookups and unread aggregates, React Router provides navigation, and Vite splits the auth/workspace routes. Firebase data stays out of service-worker runtime caches. Presence is separate from message data. Netlify Functions do not carry messages or WebRTC streams.

| Path                                   | Data and permissions                                                                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}`                          | Public-to-signed-in profile: uid, username, displayName, bio, avatar, optional photoURL thumbnail, privacy flags, createdAt/updatedAt. Exact document reads only; collection listing denied. Email stays in Firebase Auth, not discoverable profile data. |
| `usernames/{normalizedName}`           | Unique uid reservation. Exact lookup only, respects discoverability. Profile creation/rename and reservation changes are atomic. Old reservations must be released.                                                                                       |
| `users/{uid}/blocks/{otherUid}`        | Private block list; reciprocal checks protect direct messaging and new calls.                                                                                                                                                                             |
| `users/{uid}/chatPreferences/{chatId}` | Private readAt/hiddenAt markers. Account owner only.                                                                                                                                                                                                      |
| `chats/{chatId}`                       | kind, members (max 20), admin, name, description, createdAt/updatedAt, lastText, lastSender. Membership query; direct membership immutable.                                                                                                               |
| `chats/{id}/messages/{messageId}`      | sender, text (max 4,000), server timestamp, editedAt, deleted tombstone, bounded reply quote. Sender identity and timestamps cannot be rewritten.                                                                                                         |
| `…/messages/{id}/reactions/{uid}`      | One supported emoji per member. Members may only modify their own reaction.                                                                                                                                                                               |
| `chats/{id}/receipts/{uid}`            | readAt, deliveredAt, typingUntil; own writes, member reads. Typing writes throttled to four seconds and expire after eight.                                                                                                                               |
| `calls/{callId}`                       | chatId, caller/callee, participants, kind, offer/answer, state, createdAt/updatedAt, expiresAt. Participant-only access and role/state transition validation.                                                                                             |
| `calls/{id}/candidates/{id}`           | ICE owner and bounded candidate. Only participants may read; only one's own candidates may be created.                                                                                                                                                    |
| RTDB `presence/{uid}`                  | online, lastSeen, visible. Owner-only writes; other signed-in users read only if visible. `onDisconnect` handles lost connections.                                                                                                                        |

Discovery privacy prevents exact username discovery; an already-known UID can still read the minimal public profile. It is not a promise to erase a profile from existing contacts. Blocked members can still read shared history, and group messages remain visible to all current group members. Blocks prevent direct sends and new one-to-one calls, not common-group participation. This app is access-controlled, **not end-to-end encrypted**.

## Queries, receipts and free-tier costs

The sidebar listens to at most 50 conversations ordered by `updatedAt` using `members array-contains uid`. Personal preferences and blocks have one listener each. Only the selected conversation listens to its 40 newest messages and its receipts. Older pages are fetched once when requested; edits to already-loaded older pages are not live. Reactions use a small listener per live message, capped at the newest 40; older-page reactions are fetched once. Public profile lookups are cached for one minute. Call history is limited to 30 records.

Unread badges use `count()` for messages after the private read marker with a different sender and `deleted == false`, only on conversations flagged with new activity. The composite message index is included. Aggregates incur reads/index scanning; they are not free local counters. Badges may briefly show an activity dot while the aggregate loads, and are refreshed when the conversation summary changes. Deleted/edited message previews may retain their original text until a later message updates the chat summary. Very large histories, exact push-backed unread tracking and inboxes over 50 chats need a further inbox design.

Each send writes one message and the conversation summary. Receipts mark delivery only when that conversation is open in the recipient client; they do not claim device-wide delivery for unopened chats. Group double ticks require all current other members' receipts. Typing is at most one write per four seconds plus a clear on send/unmount. Presence does not repeatedly write Firestore.

Spark usage is bounded by Firebase's quotas, not a guarantee of unlimited operation. Monitor Firestore reads/writes/storage and RTDB connections/bandwidth in the Firebase console; exceeding a free quota may interrupt service. Netlify also has account-specific free plan limits. No automatic paid upgrade is configured. See [Firebase pricing](https://firebase.google.com/pricing) and [pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## Calling and networking

If calling reports a missing device, connect a microphone for voice calls and a microphone plus camera for video. An HDMI/monitor audio output only plays sound; it cannot capture your voice. Check Windows **Settings → System → Sound → Input** and browser/Windows microphone-camera permissions. Gather now displays separate help for missing devices, denied permissions and busy hardware, and never publishes an outgoing call offer when media acquisition fails. Opening a call in a regular Chrome, Edge or Brave window can avoid limitations of embedded previews.

`src/calling.tsx` acquires media, creates `RTCPeerConnection`, publishes an SDP offer in a private Firestore document, applies the callee's answer, and exchanges ICE candidates. Media travels through WebRTC, not Firestore or Netlify. There is no recording. Ringing expires after 60 seconds; acceptance must happen before expiry. Simultaneous incoming calls are rejected while busy. Local initiation is guarded against duplicates. Refresh recovery marks this client's abandoned outgoing/accepted records failed; stale incoming offers are ignored after expiry. Multiple devices sharing one account are not coordinated by an account-wide busy lock and can interfere with each other's call recovery; use one active session per account for calling.

Camera/microphone access requires HTTPS (localhost is the development exception), browser permission and available devices. Calls must be manually verified across actual devices and networks. `VITE_ICE_SERVERS=[]` deliberately uses no unreviewed third-party STUN service. Supply STUN infrastructure you are authorized to use. STUN-only connectivity fails across some NATs, corporate firewalls and mobile networks. Reliable connectivity may require TURN. Only ephemeral or otherwise public ICE credentials may appear in build-time client configuration; long-lived TURN secrets need a separate authenticated short-lived credential endpoint, which is not included.

On normal hangup/failure the app stops tracks, closes the peer, removes listeners, deletes ICE candidates and redacts SDP while retaining minimal call history. Abruptly closed clients cannot guarantee cleanup; an operator must periodically delete orphan candidate subcollections and expired signaling documents using trusted tooling. Spark has no background cleanup worker here. No group calling, call recording, quality scoring, reliable closed-app ringing, server-enforced global busy lock or automatic TURN provisioning is claimed.

## Offline, notifications and attachments

Install help is always available from the sidebar download icon, conversation options, or Settings → Install Gather. The welcome screen also has an install button. If the browser provides a native install prompt, the dialog offers it; otherwise it explains how to use a regular browser's install menu. Embedded previews may not expose native installation. Development mode now serves a manifest and development service worker (emulator mode still excludes its service worker); use the production build/preview to verify full app-shell caching. Local installations require the local server to remain running. Another device needs the deployed HTTPS address, not this computer's loopback URL.

The composer uses the MIT-licensed `emoji-picker-react` library, loaded on demand, with native emoji rendering, search, categories, skin tones and recent selections. No emoji CDN or paid service is required. Its popover is constrained to the chat panel and visible viewport, adjusts during resize, closes with Escape/outside click, and inserts at the cursor without sending the draft.

Workbox precaches static assets only. After a successful online visit, the installed shell can open offline. Firestore uses **memory-only** caching to avoid leaving private message history on shared disks. History available in the current session can remain visible; after closing/reloading offline, account/history availability is not guaranteed. Draft text, reply context and up to 20 unsent messages per chat are saved in account-scoped sessionStorage. They survive refresh and conversation switches in the same tab, but closing the tab, clearing storage or signing out removes them. Restored sends remain unconfirmed until a listener sees them or the user retries. Retry uses the original ID and a Firestore transaction: an already-saved message is acknowledged without duplicating it or overwriting later edits. Sending requires connectivity; offline sends wait for manual retry. Storage failures are explained in-app. Logout unmounts listeners and clears account recovery data. Private content is never stored in localStorage, public caches or service-worker caches. This is tab-scoped recovery, not a durable offline history or cross-device draft service.

In-app calling and message listeners require an open connected app. Browser notifications require permission and browser support. Background-tab sounds may be blocked until a user gesture. No closed-app FCM push pipeline is configured. Adding it requires token lifecycle handling, a messaging service worker and an authenticated, authorized trusted sender; never ship Admin credentials to browsers. Firebase Cloud Functions and paid push services are not needed by this initial version.

Attachments are an extension point, not a fake upload: `src/storage.ts` defines the provider contract and `Attachment` safely renders HTTPS media. A provider must enforce user/chat authorization, content type and file limits on a trusted backend. The default UI explains that uploads are unavailable. No large base64 documents are stored in Firestore.

## Account deletion and retention

Deletion requires a fresh login (within four minutes) and typing DELETE. It transfers group administration where necessary, leaves groups, removes owned username/profile, private preferences/blocks and RTDB presence, then deletes Firebase Auth credentials. Shared direct conversations, messages, quoted text, reactions and call history remain for other participants and resolve to “Deleted account” once the public profile is gone. This is shared-record retention, not deletion of all authored content. A deleted message is a shared tombstone; reply quotes and previews can retain earlier content. Do not promise regulatory erasure without a trusted operator workflow.

Deletion across Firebase Auth, Firestore and RTDB is not one atomic transaction. Network or credential failure can leave partial cleanup; re-sign in to finish or use trusted project-console tooling. Accounts with at least 100 conversations require operator assistance. Deleted-user nested shared receipts/reactions and orphaned call artifacts require periodic operator cleanup. No general-purpose Admin credential endpoint is exposed to users.

## Checks and tests

```powershell
npm run typecheck
npm run lint
npm test
npm run build
# Stop interactive emulators first; the following commands manage their own.
npm run test:rules
npm run test:integration
```

`tests/rules.test.ts` exercises unauthorized/anonymous reads, sender impersonation, immutable fields, own-message edits/deletion, blocks, receipts, reactions, profile enumeration restrictions, atomic username registration/rename, group privileges and call offer/answer/ICE permissions. RTDB tests cover presence ownership, schema and privacy. Integration testing uses two independent Firebase Auth/Firestore clients, real listeners, a complete send/edit/delete flow, group replies, membership removal and account deletion. Unit/component tests cover validation, error mapping, URL safety, call transitions, setup UI, mocked media permissions and cleanup. These checks do not prove hardware audio/video connectivity.

## Manual acceptance checklist

1. Register A and B in separate browser profiles/devices. Complete unique usernames, verify email and test logout/re-login. Test wrong password, reset email and Google popup on the authorized domain.
2. Find B by exact username; start the chat twice and confirm the same history. Send both ways. Check ordering, reply, edits, deletion, copy, emoji, reactions, unread badge, typing and receipt states. Load over 40 messages, search a keyword, load earlier search pages, jump to a highlighted result and jump to newest.
3. Disconnect the network, send, inspect the waiting state, refresh the same tab, reconnect and Retry; confirm exactly one server message. Reload the installed shell offline; no durable history promise. Switch accounts and verify the earlier private chat is inaccessible.
4. Block A from B. Confirm A cannot send new direct messages or initiate calls. Unblock. Disable discovery and presence and confirm their effects from the other account.
5. Create a group, add B, send replies/reactions, rename as admin, transfer administration, remove a member and verify removed access is denied. Verify a non-admin cannot rename, add or promote themselves.
6. On HTTPS, start a voice call A → B while both apps are open. Accept and verify two-way audio, mute, elapsed time and hangup from each side. Reject and ignore calls to test history and timeout. Deny microphone permission and retry.
7. Repeat with video; verify local/remote streams, camera toggle/switch and that browser media indicators stop on hangup. Test simultaneous calls, interrupted Wi-Fi, tab refresh and network failure. Test both a same-LAN case and different networks with your selected ICE service. Record which networks require TURN.
8. Inspect at 390×844 mobile and desktop sizes, keyboard traversal, dialog escape/focus, reduced motion and all themes. Refresh a nested chat URL.
9. Build and preview on localhost/HTTPS, install, reopen standalone and test the service-worker update prompt after a second deployment. Notifications are checked both allowed and denied.
10. With disposable accounts only, delete one and confirm profile/username cleanup, retained shared history labeling and denied old credentials.

## Troubleshooting and future work

Permission denied: deploy both rule sets, verify membership and blocks, and inspect emulator logs. Missing-index error: deploy indexes and wait until ready. Google unauthorized-domain: add the exact hostname to Firebase Auth settings. Blank app/offline setup: check environment values at build time; rebuild after changing them. Camera missing: check HTTPS, browser permission and device contention. Call stuck connecting: inspect ICE connectivity and TURN requirements. Emulator port 8188 is intentional because port 8080 was already occupied in the build environment.

Next production hardening steps are a trusted cleanup/erasure workflow, server-backed abuse controls and App Check, bounded reaction aggregation, a scalable inbox with per-user unread counters, multi-device call locking, optional TURN credentials, provider-backed attachments, push delivery and full browser/device acceptance testing. Firebase API key restrictions should be configured without breaking required Auth APIs. Authentication verification is available but unverified accounts are not prohibited from messaging in these rules.

Setup references checked during development: [Firebase modular web setup](https://firebase.google.com/docs/web/setup), [Vite requirements](https://vite.dev/guide/) and [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite).

## Profile photos

Open Your profile → Upload photo → adjust the crop → Save profile. JPG, PNG and WebP inputs up to 10 MiB and 40 megapixels are accepted. The browser crops and re-encodes them to JPEG, normally 192 × 192 pixels, reducing resolution if needed. The original image and its metadata are not uploaded. Only a bounded thumbnail (at most 32 KiB including its data URL) is stored in the existing profile document; no full-size image storage or Firebase Storage billing is required. Photos consume Firestore storage and download bandwidth. The photoURL field is excluded from indexes in firestore.indexes.json. Removing a photo restores the selected initials/color avatar. Signed-in users can view profile thumbnails; only the owner can edit them.

Existing projects must publish the updated firestore.rules before saving a photo. In Firebase Console → Firestore Database → Rules, replace the rules with the contents of firestore.rules and click Publish. Deploy the included field index exemption as well using an authenticated Firebase CLI:

```powershell
npx firebase deploy --only firestore:rules,firestore:indexes --project chat-app-f7d3d
```

Existing profiles remain valid without the optional photoURL field. Editing other profile details preserves an existing photo. Chat attachments remain a separate, disabled provider extension.

## Chat improvements

- Search this chat opens results with next/previous navigation and highlighted original messages. Search earlier messages loads another 40 history records; repeat until the beginning of the chat is reached. Deleted messages are excluded. Search is performed in the browser without a separate index or stored copy. Each loaded history page still consumes normal Firestore reads.
- Visible Sending, Sent, Delivered and Read labels distinguish server acknowledgment from peer receipts. For groups, Delivered/Read require every other current member. Read marking requires a focused, visible conversation at the newest messages. Receipts represent open conversation views, not guaranteed delivery to closed devices.
- Failed sends expose Retry and Dismiss. A transaction checks the original message ID before creating it, so reconnect/reload retries remain safe. This adds a document read to new sends but no duplicate storage.
- Mobile layouts follow the visual viewport, preserve safe-area spacing, provide larger touch targets and expose actions through an accessible menu. A deliberate short right swipe replies; vertical scrolling and long presses do not. Normal drafts are restored after editing a previous message.
- Click the contact header/photo, a group sender name, or a group member to view the profile. Enlarge a thumbnail or block/unblock there.
- Settings → Notifications enables browser permission and offers a test notification. System previews omit message contents. Messages and incoming calls can alert while the page remains connected in another tab. No closed-app/background push backend was added; browser suspension, device settings and audio gesture requirements can prevent alerts.

No new Firestore fields, indexes, rules or paid services are required for these chat improvements. Existing profile-photo rules remain required for photo updates. See docs/CHAT-IMPROVEMENTS-VALIDATION.md for checks and limitations.
