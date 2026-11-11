# launcher-components

> [!WARNING]
> **Work in progress (WIP).** This project is experimental and not ready for production use. APIs and data formats may change.

AT Protocol login and onboarding components. The current TypeScript implementation, under `ts/`, provides unstyled components for plain JavaScript, React, Vue, Svelte, and other browser apps. Includes a headless flow, accessible DOM components, and an optional official OAuth SDK adapter.

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

No CSS loads automatically. Components use light DOM, inherited fonts, and stable `data-part` attributes. Optional structural CSS: `launcher-components/styles.css`. Use `openLoginDialog` for a modal or `presentation: 'fullscreen'` for a full-page layout.

Shared translations live in `locales/`. Future implementations, such as `dart/`, can sit alongside `ts/` at the repository root. Shared test cases in `tests/fixtures/login-flow-cases.json` check consistent login behavior across implementations; they are not included in the npm package.

Not published to npm yet. Development: `npm ci && npm run check`; `npm run dev` opens the TypeScript examples. Publish later with `npm publish --access public`; npmx.dev browses npm. Nothing publishes automatically.
