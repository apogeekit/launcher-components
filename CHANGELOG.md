# Changelog

## 0.1.0-alpha.1 — 2026-11-13

- DOM components now use a fixed default stylesheet when the client omits `stylesheet`.
- Passing CSS text as `stylesheet` replaces the default entirely. Passing `stylesheet: false` leaves styling to external client CSS or renders raw markup.
- Styles stay with each component instance, work in Shadow DOM, support CSP nonces, and are removed on teardown. The headless API remains independent of styling.

When upgrading from `0.1.0-alpha.0`, clients that already load their own styles should pass `stylesheet: false` to `mountLogin`, `openLoginDialog`, and `renderProviderPicker` to retain their existing appearance.
