# Local validation · 31 October 2026

The source is implemented and the Netlify production bundle is generated in `dist/`. No production Firebase project or Netlify deployment was configured.

| Check | Observed result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no errors or warnings |
| `npm test` | 15 tests passed across 4 files |
| `npm run test:rules` | 23 tests passed across Firestore and RTDB rule suites |
| `npm run test:integration` | Two independent authenticated Firebase clients exercised registration, transactional profile/username creation, duplicate-chat prevention, live delivery, editing/deletion, group replies, removal and account deletion |
| `npm run build` | Passed; Workbox generated `sw.js` and a 17-entry precache; all output chunks below Vite's 500 kB warning threshold |
| `npm audit --omit=dev` | Zero vulnerabilities after a compatible gRPC transitive override |
| Full dependency audit | 34 remaining development-tool advisories: 2 low, 32 moderate. Compatible `npm audit fix` did not resolve these. Do not force the suggested obsolete major downgrades. Reassess upstream Firebase CLI, Workbox and lint dependencies before production CI processes untrusted input. |
| Netlify health handler | Invoked with Node TypeScript support; returned HTTP 200 with JSON status `ok` |
| Local HTTP servers | Both standard and emulator-mode root routes returned HTTP 200 |

Browser inspection used the actual React app against local Firebase Auth/Firestore/RTDB emulators. Registered a disposable account through the UI, completed its profile, found an exact username, opened a private conversation, sent a persisted message and edited it. Inspected desktop welcome/dashboard and a private conversation at 390 × 844. Fixed first-chat missing-document authorization and inaccessible hidden message controls discovered by these checks. The checked-in screenshot shows the honest unconfigured production welcome state, not simulated production conversations.

WebRTC tests mock `MediaDevices` and `RTCPeerConnection` to verify signaling-offer construction, permission rejection/retry and track/peer cleanup on hangup/unmount. Call security tests exercise participant isolation, role-specific answer transitions, ICE ownership, terminal-state immutability and SDP redaction. **Actual microphone/camera exchange across devices and networks has not been verified.**

Also unverified externally: real Google OAuth and password/email delivery, Firebase production indexes, Netlify runtime headers/routing, physical PWA installation/update delivery, mobile keyboard behavior, browser notification permissions, restrictive NAT traversal and hardware camera switching. Follow the manual acceptance checklist in `README.md` after entering your own public Firebase configuration.

Functional limits are explicit in the README: optional uploads have no provider by default; no closed-app push sender, group calling, E2EE, durable offline outbox, automatic background cleanup or account-wide multi-device call lock. Calling needs a compatible peer-to-peer network or separately configured TURN. Shared history is retained on account deletion; cross-service cleanup is not atomic.

The development runtime used Node 24 and a portable Java 21 runtime under ignored `.tools/`. Test users/data existed only in the local `demo-gather` emulator project; no billing or external resources were provisioned.
