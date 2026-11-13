# launcher-components

> [!WARNING]
> **Work in progress (WIP).** This project is experimental and not ready for production use. APIs and data formats may change.

AT Protocol login and onboarding components. The current TypeScript implementation, under `ts/`, provides components with customizable default styles for plain JavaScript, React, Vue, Svelte, and other browser apps. Includes a headless flow, accessible DOM components, and an optional official OAuth SDK adapter.

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

`mountLogin`, `openLoginDialog`, and `renderProviderPicker` include a default appearance with no CSS import: system fonts, a neutral surface, readable spacing, visible focus, and controls at least 44px tall. Components use light DOM and stable `data-part` attributes. Use `openLoginDialog` for a modal; `presentation: 'fullscreen'` also works on dialogs. Set `focusOnMount: false` for an inline form that should leave keyboard focus where it is.

### Styling

Client CSS overrides the defaults, which use zero-specificity selectors in the `launcher-components` cascade layer. For a complete client theme or raw markup, pass `unstyled: true`:

```ts
mountLogin(container, flow, { unstyled: true })
openLoginDialog(flow, { unstyled: true })
renderProviderPicker(document, { providers, onSelect, unstyled: true })
```

For a themed default, set custom properties on the component or an ancestor:

```css
.my-login {
  --launcher-accent: #175d43;
  --launcher-on-accent: #fff;
  --launcher-font: Georgia, serif;
  --launcher-radius: 0.5rem;
}
```

Other tokens: `--launcher-surface`, `--launcher-text`, `--launcher-muted`, `--launcher-border`, `--launcher-error`, and `--launcher-control-radius`. When client CSS uses named layers, declare their order up front, for example `@layer launcher-components, app;`.

Each styled instance owns its style element, including when moved into a shadow root. Unmounting removes it. The defaults only target styled component subtrees; no document-level stylesheets or fonts are loaded. The headless API has no styling side effects. Clients using CSP nonces can pass `nonce` alongside the other options. The same default stylesheet remains available as `launcher-components/styles.css` for static markup carrying `data-launcher-style="default"`.

English and Spanish catalogs live in `locales/`. Pass a catalog to `translate()` or supply your own `t` function.

Shared translations live in `locales/`. Future implementations, such as `dart/`, can sit alongside `ts/` at the repository root. Shared test cases in `tests/fixtures/login-flow-cases.json` check consistent login behavior across implementations; they are not included in the npm package.

Not published to npm yet. Development: `npm ci && npm run check`; `npm run dev` opens the TypeScript examples. Publish later with `npm publish --access public`; npmx.dev browses npm. Nothing publishes automatically.
