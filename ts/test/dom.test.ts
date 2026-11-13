// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createLoginFlow } from '../src/index'
import { mountLogin, openLoginDialog, renderProviderPicker } from '../src/dom'
import { providers } from '../../tests/fixtures/login-flow-cases.json'

afterEach(() => document.body.replaceChildren())
function root() {
  const node = document.createElement('section')
  document.body.append(node)
  return node
}

test('instances use independent IDs, visible labels, light DOM, and local effects', () => {
  document.title = 'Consumer title'
  const a = root(),
    b = root()
  const one = createLoginFlow({ providers, auth: { start: async () => {} } })
  const two = createLoginFlow({ providers, auth: { start: async () => {} } })
  const stopOne = mountLogin(a, one),
    stopTwo = mountLogin(b, two)
  const ids = [...document.querySelectorAll('[id]')].map(n => n.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(a.querySelector('label')!.htmlFor).toBe(a.querySelector('input')!.id)
  expect(a.shadowRoot).toBeNull()
  expect(document.title).toBe('Consumer title')
  stopOne()
  one.destroy()
  expect(b.querySelector('input')).not.toBeNull()
  stopTwo()
  two.destroy()
})

test('handle validation retains input, describes the error, and moves focus to the field', async () => {
  const node = root()
  const start = vi.fn(async () => {})
  const flow = createLoginFlow({ providers, auth: { start } })
  mountLogin(node, flow)
  node.querySelector('input')!.value = 'alice'
  node.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  const input = node.querySelector('input')!
  expect(input.value).toBe('alice')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input)
  expect(input.getAttribute('aria-describedby')).toContain(node.querySelector('[role="alert"]')!.id)
  expect(start).not.toHaveBeenCalled()
  flow.destroy()
})

test('inline mounting can preserve focus while later navigation still announces its screen', () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const node = root()
  const flow = createLoginFlow({ providers, auth: { start: async () => {} } })
  const stop = mountLogin(node, flow, { focusOnMount: false })
  expect(document.activeElement).toBe(opener)
  flow.showSignup()
  expect(document.activeElement).toBe(node.querySelector('h2'))
  stop()
  flow.destroy()
})

test('full-screen dialogs expose presentation and restore the opener after closing', () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const flow = createLoginFlow({ providers, auth: { start: async () => {} } })
  const onClose = vi.fn()
  const view = openLoginDialog(flow, { presentation: 'fullscreen', focusOnMount: false, onClose })
  expect(view.dialog.open).toBe(true)
  expect(view.dialog.dataset.presentation).toBe('fullscreen')
  expect(document.activeElement).toBe(view.dialog.querySelector('h2'))
  view.close()
  // Native close events are queued by browsers; dispatch here for the DOM test environment.
  view.dialog.dispatchEvent(new Event('close'))
  expect(view.dialog.isConnected).toBe(false)
  expect(document.activeElement).toBe(opener)
  view.destroy()
  expect(onClose).toHaveBeenCalledOnce()
  flow.destroy()
})

test('provider selection preserves filtering, never submits a parent form, and safely renders text', () => {
  const page = root()
  const selected = vi.fn()
  const picker = renderProviderPicker(document, {
    providers: [
      ...providers,
      { ...providers[0]!, id: 'unsafe', name: '<img src=x onerror=alert(1)>', description: '<script>steal()</script>' },
    ],
    onSelect: selected,
    logoUrl: () => 'javascript:alert(1)',
  })
  page.append(picker.element)
  expect(page.querySelector('img, script')).toBeNull()
  expect(page.textContent).toContain('<script>steal()</script>')
  expect(page.querySelector('[data-provider="disabled"]')).toBeNull()
  for (const b of page.querySelectorAll('button')) expect(b.type).toBe('button')
  const invite = page.querySelectorAll('select')[0]!
  invite.value = 'required'
  invite.dispatchEvent(new Event('change'))
  expect([...page.querySelectorAll<HTMLElement>('.provider:not([hidden])')].map(n => n.dataset.provider)).toEqual([
    'beta',
  ])
  page.querySelector<HTMLButtonElement>('.clear-filters')!.click()
  page.querySelector<HTMLButtonElement>('[data-provider="alpha"]')!.click()
  expect(selected).toHaveBeenCalledWith(providers[0])
})

test('busy controls block duplicate selection and recover without leaking library errors', async () => {
  const node = root()
  const flow = createLoginFlow({
    providers,
    mode: 'signup',
    auth: {
      start: async () => {
        throw new Error('secret authorization URL')
      },
    },
  })
  mountLogin(node, flow, { headingLevel: 1 })
  node.querySelector('button')!.click()
  node.querySelector<HTMLButtonElement>('.provider')!.click()
  expect(node.getAttribute('aria-busy')).toBe('true')
  expect([...node.querySelectorAll('button, input, select')].every(n => (n as HTMLInputElement).disabled)).toBe(true)
  await vi.waitFor(() => expect(node.dataset.view).toBe('error'))
  expect(node.textContent).not.toContain('secret authorization URL')
  node.querySelector('button')!.click()
  expect(node.dataset.view).toBe('providers')
  expect(document.activeElement).toBe(node.querySelector('h1'))
  flow.destroy()
})

test('default styles survive screen changes, honor a CSP nonce, and leave with the instance', () => {
  const node = root()
  node.setAttribute('data-launcher-style', 'client-value')
  const flow = createLoginFlow({ providers, auth: { start: async () => {} } })
  const stop = mountLogin(node, flow, { nonce: 'test-nonce' })
  const style = node.querySelector('style')!
  expect(style.nonce).toBe('test-nonce')
  expect(document.head.querySelector('style')).toBeNull()
  flow.showSignup()
  flow.showProviders()
  expect(node.querySelectorAll('style')).toHaveLength(1)
  expect(node.querySelector('style')).toBe(style)
  stop()
  flow.destroy()
  expect(node.getAttribute('data-launcher-style')).toBe('client-value')
  expect(node.querySelector('style')).toBeNull()
})

test('unstyled flows keep signup screens and embedded pickers free of default styles', () => {
  const node = root()
  const flow = createLoginFlow({ providers, auth: { start: async () => {} } })
  const stop = mountLogin(node, flow, { stylesheet: false })
  flow.showProviders()
  expect(node.querySelector('[data-part="provider-picker"]')).not.toBeNull()
  expect(node.querySelector('style')).toBeNull()
  expect(node.hasAttribute('data-launcher-style')).toBe(false)
  stop()
  flow.destroy()
})

test('a client stylesheet replaces the default for the entire flow', () => {
  const node = root()
  const flow = createLoginFlow({ providers, auth: { start: async () => {} } })
  const stylesheet = '[data-launcher] { font-family: serif; }'
  const stop = mountLogin(node, flow, { stylesheet, nonce: 'client-nonce' })
  flow.showProviders()
  expect(node.querySelectorAll('style')).toHaveLength(1)
  expect(node.querySelector('style')!.textContent).toBe(stylesheet)
  expect(node.querySelector('style')!.nonce).toBe('client-nonce')
  expect(node.getAttribute('data-launcher-style')).toBe('custom')
  expect(node.querySelector('[data-launcher-style="default"]')).toBeNull()
  stop()
  flow.destroy()
})

test('an explicitly empty client stylesheet does not fall back to the default', () => {
  const node = root()
  const flow = createLoginFlow({ providers, auth: { start: async () => {} } })
  const stop = mountLogin(node, flow, { stylesheet: '' })
  expect(node.querySelector('style')!.textContent).toBe('')
  expect(node.getAttribute('data-launcher-style')).toBe('custom')
  stop()
  flow.destroy()
})

test('standalone pickers carry default styles into shadow roots and can opt out', () => {
  const shadow = root().attachShadow({ mode: 'open' })
  const styled = renderProviderPicker(document, { providers, onSelect() {}, nonce: 'picker-nonce' })
  const raw = renderProviderPicker(document, { providers, onSelect() {}, stylesheet: false })
  const clientCss = '[data-part="provider-picker"] { color: green; }'
  const custom = renderProviderPicker(document, { providers, onSelect() {}, stylesheet: clientCss })
  shadow.append(styled.element, raw.element, custom.element)
  expect(styled.element.querySelector('style')!.getRootNode()).toBe(shadow)
  expect(styled.element.querySelector('style')!.nonce).toBe('picker-nonce')
  expect(raw.element.querySelector('style')).toBeNull()
  expect(raw.element.hasAttribute('data-launcher-style')).toBe(false)
  expect(custom.element.querySelector('style')!.textContent).toBe(clientCss)
  expect(custom.element.getAttribute('data-launcher-style')).toBe('custom')
})

test('dialogs use only the selected stylesheet across all screens', () => {
  const clientCss = '[data-launcher-dialog] { color: green; }'
  for (const stylesheet of [undefined, clientCss, false] as const) {
    const flow = createLoginFlow({ providers, auth: { start: async () => {} } })
    const view = openLoginDialog(flow, { stylesheet, nonce: 'dialog-nonce' })
    flow.showProviders()
    expect(view.dialog.querySelectorAll('style')).toHaveLength(stylesheet === false ? 0 : 1)
    if (stylesheet !== false) expect(view.dialog.querySelector('style')!.nonce).toBe('dialog-nonce')
    if (typeof stylesheet === 'string') expect(view.dialog.querySelector('style')!.textContent).toBe(clientCss)
    view.destroy()
    flow.destroy()
    expect(document.querySelector('dialog, style')).toBeNull()
  }
})
