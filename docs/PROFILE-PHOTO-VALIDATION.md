# Profile photo validation — 2026-11-01

Added bounded JPEG thumbnails to the existing profile model and shared Avatar component. The editor supports local file selection, zoom and position, replacement, removal and preview. Original files stay in the browser; thumbnails are capped at 32,768 characters including their data URL. Firestore permits only owner writes, optional legacy fields, null removal and bounded JPEG-prefixed data. The photo field is excluded from indexing. Existing photos survive unrelated profile edits.

Validation passed:

- 44 unit/component tests, including format/size rejection, legacy avatar fallback, crop geometry, compression fallback, failed selections, removal and immediate save after changing the crop.
- 25 Firestore/Realtime Database security tests, including owner-only photo changes, unauthenticated denial, legacy profiles and oversized/external/non-JPEG rejection.
- 2 Firebase integration tests against demo-gather emulators, including adding, preserving and removing a photo through saveProfile.
- TypeScript, ESLint and production/PWA build.
- In-app browser against isolated emulator app on port 5175: selected the synthetic local PNG fixture, prepared a 192 × 192 JPEG of approximately 5 KB, adjusted crop, saved, reloaded and confirmed the saved data URL matched the preview. Removed the photo, saved, reloaded and confirmed initials returned. Checked a 320 × 740 viewport: dialog scrollWidth matched clientWidth (272 px); controls and save remained usable. Viewport restored after testing.

Screenshot: [profile-photo-preview.png](profile-photo-preview.png). Only synthetic test data was written to local emulators; no fixture was applied to a live account. Live Firebase rules and index exemption still require deployment by an authenticated project owner. In Firebase Console → Firestore Database → Rules, paste the complete updated firestore.rules and Publish. The README includes the CLI command to deploy both rules and index configuration.
