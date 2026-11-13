# launcher-components

> [!WARNING]
> **Work in progress (WIP).** This project is experimental and not ready for production use. APIs and data formats may change.

AT Protocol login and onboarding components. The current TypeScript implementation, under `ts/`, provides components for plain JavaScript, React, Vue, Svelte, and other browser apps. A fixed default stylesheet is used when the client supplies no styling. Includes a headless flow, accessible DOM components, and an optional official OAuth SDK adapter.

```sh
npm install github:solimaniac/launcher-components github:solimaniac/pds-registry @atproto/oauth-client-browser
```

```ts
import { createLoginFlow } from 'launcher-components'
import { mountLogin } from 'launcher-components/dom'
import { createBrowserOAuthAdapter } from 'launcher-components/oauth'
import { selectProviders } from 'pds-registry'

const flow = createLoginFlow({
  providers: selectProviders({ ids: ['eurosky', 'blacksky'] }),
  auth: createBrowserOAuthAdapter(oauthClient), // Your BrowserOAuthClient
  onSuccess: result => {
    /* Use result.session in your app. */
  },
})
const unmount = mountLogin(container, flow, { appName: 'Your app' })
// On teardown: unmount(); flow.destroy()
```

`mountLogin`, `openLoginDialog`, and `renderProviderPicker` use the default stylesheet when `stylesheet` is omitted: system fonts, a neutral surface, readable spacing, visible focus, and controls at least 44px tall. Components use light DOM and stable `data-part` attributes. Use `openLoginDialog` for a modal; `presentation: 'fullscreen'` also works on dialogs. Set `focusOnMount: false` for an inline form that should leave keyboard focus where it is.

### Styling

Choose one stylesheet for each instance:

- Omit `stylesheet` to use the fixed built-in stylesheet.
- Pass CSS text as `stylesheet` to use the client's stylesheet instead. The built-in stylesheet is not injected or merged with it.
- Pass `stylesheet: false` when the client loads CSS separately, or to render raw markup.

```ts
mountLogin(container, flow) // Built-in stylesheet
mountLogin(container, flow, { stylesheet: clientCss }) // Client stylesheet only
openLoginDialog(flow, { stylesheet: clientCss })
renderProviderPicker(document, { providers, onSelect, stylesheet: clientCss })
mountLogin(container, flow, { stylesheet: false }) // External CSS or raw markup
```

Client styles own the full appearance and can target `data-launcher`, `data-part`, and `data-launcher-dialog`. The built-in stylesheet has no theme options or customization tokens. Stylesheet selection is explicit; the library does not try to detect external CSS.

Each instance owns its selected style element, including when moved into a shadow root. Unmounting removes it. The default only targets instances using it; no document-level stylesheets or fonts are loaded. The headless API has no styling side effects. Clients using CSP nonces can pass `nonce` alongside the other options. The same default stylesheet remains available as `launcher-components/styles.css` for static markup carrying `data-launcher-style="default"`.

English and Spanish catalogs live in `locales/`. Pass a catalog to `translate()` or supply your own `t` function.

Shared translations live in `locales/`. Future implementations, such as `dart/`, can sit alongside `ts/` at the repository root. Shared test cases in `tests/fixtures/login-flow-cases.json` check consistent login behavior across implementations; they are not included in the npm package.

Not published to npm yet. Development: `npm ci && npm run check`; `npm run dev` opens the TypeScript examples. Publish later with `npm publish --access public`; npmx.dev browses npm. Nothing publishes automatically.
