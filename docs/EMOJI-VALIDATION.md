# Emoji picker update · 1 November 2026

Replaced the custom 24-emoji menu with `emoji-picker-react` 5.1.4 (MIT). The library supplies searchable native emojis, categories, skin tones and recently used selections. It is split into an on-demand chunk and uses the existing application theme.

The menu measures the chat panel, composer and visual viewport. Its fixed-position bounds are clamped to their intersection and recomputed on container resize, screen resize and visual-viewport movement. This replaces the old fixed-width grid and its unbounded position above the footer. Escape, close and outside-click dismissal are supported. Selection inserts at the draft cursor or replaces selected text while respecting the message limit.

Browser verification passed for desktop and viewport overrides of 390×844, 320×568 and 844×390. DOM bounds confirmed that the menu was wholly within both chat and screen in every layout, with no document horizontal overflow. Search for “rocket” returned matching emojis; selection inserted 🚀 into the draft and advanced the cursor. Escape and outside-click dismissal passed. The original draft was restored; no chat message was sent. The saved preview crops to the picker/composer without including conversation history.

Executed successfully: TypeScript check, ESLint, production build, 28 unit/component tests and production dependency audit (zero vulnerabilities). Firebase rules and data model were unchanged. Physical mobile keyboard behavior was not tested; the positioner listens to the Visual Viewport API for keyboard-driven viewport changes.
