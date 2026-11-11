# Integration

The TypeScript implementation lives in `implementations/typescript/` and works with plain JavaScript, React, Vue, Svelte, or a custom renderer.

| Import                      | Provides                                                             |
| --------------------------- | -------------------------------------------------------------------- |
| `launcher-components`       | Headless flow, types, validation, and translation helpers            |
| `launcher-components/dom`   | Unstyled DOM screens, dialogs, and a standalone provider picker      |
| `launcher-components/oauth` | Optional adapter for the official browser OAuth SDK                  |
| `pds-registry`              | Compatible provider data, selection helpers, JSON, schema, and logos |

## OAuth

The app owns its OAuth client metadata, callback route, and SDK instance. Metadata must be public HTTPS (or the SDK's loopback development client), and its scopes and callback URLs must match the client. See the [official SDK](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client-browser) and [OAuth specification](https://atproto.com/specs/oauth).

```ts
import { BrowserOAuthClient } from '@atproto/oauth-client-browser'
import { createBrowserOAuthAdapter } from 'launcher-components/oauth'

const client = await BrowserOAuthClient.load({
  clientId: 'https://your-app.example/oauth-client-metadata.json',
  handleResolver: 'https://bsky.social',
  responseMode: 'fragment',
})
const auth = createBrowserOAuthAdapter(client, {
  scope: 'atproto', // Add your app's permissions here and in its metadata.
  responseMode: 'fragment',
  session: 'retain',
})
```

The SDK handles protocol verification and session storage. `atproto` alone proves authorization; it does not grant app data access. Passwords, account creation, email verification, invites, and terms stay on the host's page.

On your callback route, create the flow and call `await flow.finish()`. The adapter captures and removes authorization parameters before asynchronous initialization. Pass `URLSearchParams` to `finish(params)` when your router handles URL cleanup. The adapter and SDK response modes must match; both default to `fragment`. `consumeOAuthResponse(mode?)` is available for explicit capture and cleanup.

Redirect is the default transport. Set `transport: 'popup'` to let the SDK manage a separate browser window and callback communication. Initialize the client before the click when possible to preserve popup activation. Blocked or dismissed popups are recoverable errors; callback handoff to the opener stays pending without showing failure. Dialog presentation and OAuth transport are independent.

The default `session: 'retain'` returns `{ handle, state, cleanupFailed, session }`. A signup broker should use `session: 'discard'`: cleanup runs before handle lookup, and the result omits the session and DID. Check `cleanupFailed`; successful signup does not sign the user into another app. A failed public identity lookup produces `handle: null`.

Other adapter options are `state` and `recoverState`. State is application context; validate it against app configuration. The app owns navigation after verified completion. `LauncherError` contains a public translation `key` and recovered `state`, never a raw SDK exception.

A backend integration can supply its own `AuthAdapter<Result>` with `start({ intent, input, provider?, signal })` and optional `finish(params?)`. The backend owns protocol verification, sessions, and redirect validation. Returning a result completes the flow; returning `void` leaves a redirect or popup handoff pending. `Result` must not be `undefined`.

## Flow and hosts

```ts
import { createLoginFlow } from 'launcher-components'
import { providers } from 'pds-registry'

const flow = createLoginFlow({
  providers,
  auth,
  mode: 'both', // Default; also 'signin' or 'signup'.
  providerAllowlist: ['eurosky', 'blacksky'],
  onSuccess: result => {
    /* Use the verified result in your app. */
  },
})
```

Combined and signin-only modes start at sign-in; signup-only mode starts with the explanation. An omitted allowlist offers all enabled signup hosts; an empty list offers none; unknown IDs throw. Disabled hosts stay hidden. This policy applies to signup: existing handles still discover their current host. Enforce account-host restrictions after verified identity resolution in your OAuth client or backend.

Custom signup requires `allowCustomService: true` and cannot be combined with an allowlist. Custom arrays matching `AccountProvider` work without `pds-registry`. Hosts must support AT Protocol OAuth and account creation; directory inclusion does not guarantee availability.

| Flow member                                       | Behavior                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `getState()`                                      | Immutable `{ view, busy, identifier, error?, result? }` snapshot   |
| `subscribe(listener)`                             | Listen for changes; returns unsubscribe; does not call immediately |
| `showSignIn()`, `showSignup()`, `showProviders()` | Navigate within the configured mode                                |
| `signIn(identifier)`                              | Normalize a full handle or DID and start authorization             |
| `signUp(providerId)`, `signUpCustom(service)`     | Start allowed hosted signup                                        |
| `finish(params?)`                                 | Complete the adapter callback                                      |
| `back()`, `retry()`                               | Navigate back or recover the previous screen                       |
| `destroy()`                                       | Abort pending work, detach subscribers, and ignore late results    |

Busy operations block navigation and duplicate requests. Provider metadata is a bundled snapshot; the components do not fetch a remote directory or contact hosts when mounted. Missing invite information means unknown. Copy `node_modules/pds-registry/providers/` into your public assets and supply a `logoUrl` resolver when using logos. Each provider's logo sits beside its `provider.json` record.

## Rendering, styling, and translations

```ts
import { mountLogin, openLoginDialog } from 'launcher-components/dom'

const unmount = mountLogin(container, flow, {
  appName: 'Your app',
  presentation: 'fullscreen', // Or 'inline' (default).
  headingLevel: 1,
  logoUrl: provider => (provider.logo ? '/hosts/' + provider.id + '/' + provider.logo : undefined),
})
// On teardown: unmount(); flow.destroy()

// Alternatively, on its own flow:
const modal = openLoginDialog(dialogFlow, { appName: 'Your app' })
// modal.close() / modal.destroy()
```

`mountLogin` also accepts `t`, `idPrefix`, `onScreen(root, view)`, and `renderComplete(root, result)`. Each mount gets independent IDs by default. The default completion screen does not serialize the auth result. Unmounting removes children and subscriptions; the caller still owns the flow.

`openLoginDialog` accepts the same options plus `document` and `onClose`, and returns `{ dialog, close(), destroy() }`. Native `<dialog>` provides focus containment and Escape; opener focus is restored on close. Closing does not revoke authorization. Destroy the flow when it is no longer needed.

For just the host picker, use `renderProviderPicker(document, { providers, onSelect, t?, state?, idPrefix?, logoUrl? })`, returning `{ element, setBusy }`. `createProviderPickerState()` retains filters between mounts.

Components use light DOM and inherit the app's typography and theme. Optional `launcher-components/styles.css` adds layout, visible focus, and 44px controls with zero-specificity selectors. Keep accessible focus and touch targets when replacing it. Hooks include `[data-launcher]`, `[data-view]`, and `[data-part="provider"]`; parts include `heading`, `identifier`, `submit`, `button`, `auth-status`, `provider-picker`, `provider`, `provider-details`, `region`, `provider-description`, and `dialog`.

Pass `t(key, values)` from your localization system, or use `translate({ ...english, 'signin.submit': 'Continue' })`. Copy, app names, and provider descriptions are rendered as text. Directory descriptions are English; apps can translate them by provider ID.

React can mount into an empty ref in an effect; Vue uses `onMounted`/`onUnmounted`, and Svelte uses `onMount` with teardown. Render framework children outside that DOM root. A custom renderer can subscribe to the headless flow; React can use `useSyncExternalStore`. Use one flow per login surface. Imports are SSR-safe; DOM and OAuth URL helpers run in the browser.

## Other programming languages

Shared files remain independent of TypeScript:

- [`contracts/v1/flow.json`](../contracts/v1/flow.json): modes, views, intents, errors, actions, and behavior rules.
- [`contracts/v1/conformance.json`](../contracts/v1/conformance.json): fictional hosts and 21 executable behavior scenarios.
- [`copy/en.json`](../copy/en.json): shared strings and `{{appName}}`, `{{name}}`, `{{count}}`, and `{{total}}` placeholders.

TypeScript checks its public types against the contract during type checking and runs the scenarios in `npm test`. Cases provide configuration, simulated auth, and ordered steps. Compare only supplied `expect` fields; `defer` leaves operations pending and `resolve` settles them. Normalize absent errors to `null` and expose result presence as `hasResult`. The [TypeScript runner](https://github.com/solimaniac/launcher-components/blob/main/implementations/typescript/test/conformance.test.ts) is a reference for native runners.

A future Dart/Flutter package can live under `implementations/flutter/` with its own manifest, widgets, OAuth adapter, SDK, tests, CI, and pub.dev release. It can bundle the shared copy or convert it to ARB, run the same scenarios, and consume the registry's [provider records](https://github.com/solimaniac/pds-registry/tree/main/providers) and [schema](https://github.com/solimaniac/pds-registry/blob/main/schema.json) without running JavaScript. Fonts, theme, native presentation, protocol verification, and secure session storage belong to the implementation and consuming app.

Language-package releases are independent. Record the supported contract major version; breaking shared behavior needs a new contract directory such as `contracts/v2/`. The existing JSON files are also exported by the npm package at `launcher-components/contracts/v1/flow.json`, `launcher-components/contracts/v1/conformance.json`, and `launcher-components/copy/en.json`.
