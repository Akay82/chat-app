# Authentication validation · 1 November 2026

Tested the real app with disposable Firebase Auth, Firestore and Realtime Database emulator accounts. Live Firebase users and cloud settings were not modified.

## Fixed

- Profile edits with an unchanged username attempted to overwrite an immutable username reservation. The client now writes a reservation only when it does not exist. No security rules were weakened.
- Login incorrectly enforced the new-account eight-character password minimum. Existing accounts can now sign in with their valid shorter passwords; registration still requires eight characters.
- A verification-email delivery failure incorrectly appeared to fail signup after the account had already been created. Signup now completes, with a notice explaining how to resend verification.
- Repeated form submits are guarded while a request is pending; stale validation/reset errors clear on retry or route changes.
- A denied profile read was treated as a missing profile and sent users back to onboarding. It now displays a signed-in profile error with retry/signout controls. Late callbacks after signout cannot restore a previous profile.
- Logout could trigger a misleading permission toast from a listener losing access. Those expected auth-transition errors are suppressed. Presence disconnects before authentication is removed, triggering its registered offline update; presence reconnects after login.
- Added actionable messages for disabled providers, unauthorized Google domains, blocked popups and network failures.
- `.env.local` could override the emulator project configuration. Emulator app/test configurations now force the checked-in local demo project and integration tests refuse to run against a live project.

## Evidence

Final executed checks passed: **28 unit/component tests, 23 security-rule tests and 2 integration tests (53 total)**; TypeScript checks, ESLint and the production build also passed.

- Unit/component tests exercise form validation, duplicate-email feedback, wrong-password retry, six-character legacy login, duplicate-submit prevention, verification-delivery failure recovery, Google unauthorized-domain feedback, reset retries, denied-profile retry, stale callback suppression and presence/signout ordering.
- Real emulator integration tests exercise signup, verification action-code completion, logout, incorrect passwords, duplicate email, password-reset code validation/completion, rejection of the old password and login using the new password from a second Auth session. The messaging integration also repeats profile saving without changing username and checks account cleanup.
- Browser flow passed: signup → Make it yours → dashboard → edit profile with unchanged username → logout → wrong-password error → correct login → reload → saved profile remains → logout without the earlier permission toast.
- Existing Firestore and RTDB rules remain unchanged. Their security suite is included in the final checks, alongside TypeScript, lint and the production build.

These checks validate local behavior with the same security rules as the repository. They do not certify the rules/indexes currently published in your real project, actual email delivery to an external inbox, or successful real Google OAuth. Those require your live Firebase provider/domain configuration. Use `localhost` for the project's currently authorized local Google domain.
