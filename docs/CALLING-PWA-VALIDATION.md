# Calling devices and PWA installation · 1 November 2026

## Findings and changes

- A read-only Windows device inventory showed a monitor audio-output endpoint and no microphone/camera input in the queried endpoint classes. This explains why requesting capture devices can fail; an output device cannot record a voice. No Windows settings or permissions were changed.
- Media acquisition now converts missing-device, permission-denial and unavailable/busy-device errors into actionable help dialogs. Voice calls request audio only; video calls explicitly require both audio and camera. Missing devices do not create a signaling offer. A failed incoming acceptance now ends its signaling attempt rather than leaving the caller ringing until expiry.
- Installation UI was conditional on `beforeinstallprompt`, which embedded browsers and other unsupported contexts may never fire. Installation help is now discoverable from the welcome screen, sidebar, conversation options and Settings regardless of that event. A real deferred browser prompt is used only when the browser supplies one; otherwise users see regular-browser instructions. Installed/standalone state and failed prompts are handled.
- The Vite development server previously did not expose the PWA manifest/service worker. Its PWA development support is now enabled outside emulator mode. Generated `dev-dist` assets are excluded from source control and linting. The production manifest has an explicit identity and scope.

## Executed verification

- TypeScript, lint, production build and **36 unit/component tests passed**. New tests cover missing microphone, missing video hardware, permission retry, install help without a prompt event, navigation access, deferred prompt use, prompt failure and installed-state handling.
- Local HTTP checks returned 200 with the appropriate content types for `/manifest.webmanifest`, `/dev-sw.js?dev-sw`, and both PNG icons. The production build generated its manifest, icons and Workbox worker.
- Browser verification confirmed that the visible install control opens the fallback instructions in the in-app browser. That browser did not offer a native installation event. No OS-level installation was claimed or performed.

Hardware audio/video exchange still requires actual input devices, browser permission and a compatible WebRTC network. These tests do not provide missing hardware or TURN infrastructure. Native installation must be checked in a supported regular browser, and a local installed app depends on its development server. Closed-app incoming calling is still not promised.
