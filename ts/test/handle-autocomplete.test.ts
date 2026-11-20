// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mountLogin, openLoginDialog } from '../src/dom'
import { createLoginFlow } from '../src/index'

const appViewUrl = 'https://appview.example/atproto/'
const avatarUrl = 'https://avatars.example/alice.png'
const search = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.useFakeTimers()
  search.mockReset()
  vi.stubGlobal('fetch', search)
})

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function makeFlow() {
  const start = vi.fn(async () => ({ ok: true }))
  return { start, flow: createLoginFlow({ providers: [], auth: { start } }) }
}

function mount(appViewUrl?: string) {
  const node = document.createElement('section')
  document.body.append(node)
  const { start, flow } = makeFlow()
  const stop = mountLogin(node, flow, { appViewUrl })
  const input = node.querySelector('input')!
  input.focus()
  return { node, start, flow, stop, input }
}

function typeHandle(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function press(input: HTMLInputElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { ...init, key, bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  return event
}

function submit(node: HTMLElement) {
  node.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

function deferSearch() {
  let resolve!: (response: Response) => void
  search.mockReturnValueOnce(new Promise(done => {
    resolve = done
  }))
  return resolve
}

test('queries the configured AppView and fills a suggested handle through the keyboard', async () => {
  search.mockResolvedValueOnce(Response.json({
    actors: [
      null,
      { handle: 'handle.invalid' },
      { handle: 'alice.3com' },
      { handle: 'Alice.Profile.Example', displayName: '<b>Alice</b>', avatar: avatarUrl },
      { handle: 'alice.profile.example' },
      { handle: '8.cn', avatar: 'javascript:alert(1)' },
    ],
  }))
  const { node, input, start, stop } = mount(appViewUrl)
  const list = node.querySelector<HTMLUListElement>('[role="listbox"]')!
  expect(list.previousElementSibling).toBe(input)
  expect(input.getAttribute('aria-controls')).toBe(list.id)
  expect(list.hidden).toBe(true)

  typeHandle(input, 'a')
  typeHandle(input, ' @Ali. ')
  expect(search).not.toHaveBeenCalled()
  await vi.runOnlyPendingTimersAsync()
  expect(search).toHaveBeenCalledOnce()
  const [requestUrl, request] = search.mock.calls[0]!
  expect(String(requestUrl)).toBe(`${appViewUrl}xrpc/app.bsky.actor.searchActorsTypeahead?limit=5&q=ali.`)
  expect(request?.credentials).toBe('omit')

  expect(input.getAttribute('aria-expanded')).toBe('true')
  const [alice, eight] = list.children
  expect(list.children).toHaveLength(2)
  expect(alice?.querySelector('[data-part="suggestion-display-name"]')?.textContent).toBe('<b>Alice</b>')
  expect(alice?.querySelector('[data-part="suggestion-handle"]')?.textContent).toBe('@alice.profile.example')
  expect(alice?.querySelector('b')).toBeNull()
  const avatar = alice?.querySelector('img')
  expect(avatar?.src).toBe(avatarUrl)
  expect(avatar?.referrerPolicy).toBe('no-referrer')
  avatar?.dispatchEvent(new Event('error'))
  expect(alice?.querySelector('img')).toBeNull()
  expect(eight?.querySelector('img')).toBeNull()

  press(input, 'ArrowUp')
  expect(eight?.getAttribute('aria-selected')).toBe('true')
  expect(press(input, 'ArrowUp', { shiftKey: true }).defaultPrevented).toBe(false)
  expect(input.hasAttribute('aria-activedescendant')).toBe(false)
  expect(eight?.getAttribute('aria-selected')).toBe('false')
  press(input, 'ArrowDown')
  expect(input.getAttribute('aria-activedescendant')).toBe(alice?.id)
  expect(press(input, 'a', { ctrlKey: true }).defaultPrevented).toBe(false)
  expect(input.hasAttribute('aria-activedescendant')).toBe(false)
  press(input, 'ArrowDown')
  expect(press(input, 'Enter').defaultPrevented).toBe(true)
  expect(input.value).toBe('alice.profile.example')
  expect(document.activeElement).toBe(input)
  expect(list.hidden).toBe(true)
  expect(input.hasAttribute('aria-activedescendant')).toBe(false)
  expect(start).not.toHaveBeenCalled()
  await vi.runOnlyPendingTimersAsync()
  expect(search).toHaveBeenCalledOnce()
  submit(node)
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ intent: 'signin', input: 'alice.profile.example' }))
  stop()
})

test('the dialog passes through the AppView and supports pointer selection', async () => {
  search.mockResolvedValueOnce(Response.json({ actors: [{ handle: 'alice.example', displayName: 'Alice' }] }))
  const { flow, start } = makeFlow()
  const view = openLoginDialog(flow, { appViewUrl })
  const input = view.dialog.querySelector('input')!
  input.focus()
  typeHandle(input, 'ali')
  await vi.runOnlyPendingTimersAsync()
  const option = view.dialog.querySelector<HTMLElement>('[role="option"]')!
  const pointer = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  expect(option.dispatchEvent(pointer)).toBe(false)
  option.click()
  expect(input.value).toBe('alice.example')
  expect(input.getAttribute('aria-expanded')).toBe('false')
  expect(start).not.toHaveBeenCalled()
  typeHandle(input, 'bob')
  expect(press(input, 'Escape').defaultPrevented).toBe(false)
  await vi.runOnlyPendingTimersAsync()
  expect(search).toHaveBeenCalledOnce()
  view.destroy()
})

test.each(['mouse', 'touch'])('submit keeps its position as open suggestions lose focus (%s)', async pointerType => {
  search.mockResolvedValueOnce(Response.json({ actors: [{ handle: 'alice.example' }] }))
  const { node, input, start, stop } = mount(appViewUrl)
  typeHandle(input, 'alice.example')
  await vi.runOnlyPendingTimersAsync()
  const button = node.querySelector<HTMLButtonElement>('[type="submit"]')!
  const pointer = { pointerId: 1, pointerType, bubbles: true }
  button.dispatchEvent(new PointerEvent('pointerdown', pointer))
  if (pointerType === 'touch') button.dispatchEvent(new PointerEvent('pointerup', pointer))
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  button.focus()
  await vi.runOnlyPendingTimersAsync()
  expect(input.getAttribute('aria-expanded')).toBe('true')
  if (pointerType === 'mouse') button.dispatchEvent(new PointerEvent('pointerup', pointer))
  button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  button.click()
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ input: 'alice.example' }))
  stop()
})

test('an outside touch cancels a pending lookup before it can move the touch target', async () => {
  const resolve = deferSearch()
  const { node, input, stop } = mount(appViewUrl)
  typeHandle(input, 'alice.example')
  await vi.runOnlyPendingTimersAsync()
  const button = node.querySelector<HTMLButtonElement>('[type="submit"]')!
  button.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch', bubbles: true }))
  expect(search.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  resolve(Response.json({ actors: [{ handle: 'alice.example' }] }))
  await vi.runOnlyPendingTimersAsync()
  expect(input.getAttribute('aria-expanded')).toBe('false')
  stop()
})

test('committing text with an input method starts autocomplete', async () => {
  search.mockResolvedValueOnce(Response.json({ actors: [{ handle: 'alice.example' }] }))
  const { input, stop } = mount(appViewUrl)
  input.dispatchEvent(new CompositionEvent('compositionstart'))
  input.value = 'ali'
  input.dispatchEvent(new InputEvent('input', { isComposing: true }))
  await vi.runOnlyPendingTimersAsync()
  expect(search).not.toHaveBeenCalled()
  input.dispatchEvent(new CompositionEvent('compositionend', { data: 'ali' }))
  await vi.runOnlyPendingTimersAsync()
  expect(search).toHaveBeenCalledOnce()
  expect(input.getAttribute('aria-expanded')).toBe('true')
  stop()
})

test('pointing at the textbox clears keyboard selection and an outside click dismisses the list', async () => {
  search.mockResolvedValueOnce(Response.json({ actors: [{ handle: 'alice.example' }] }))
  const { input, stop } = mount(appViewUrl)
  typeHandle(input, 'alice')
  await vi.runOnlyPendingTimersAsync()
  press(input, 'ArrowDown')
  expect(input.hasAttribute('aria-activedescendant')).toBe(true)
  input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  expect(input.hasAttribute('aria-activedescendant')).toBe(false)
  expect(input.getAttribute('aria-expanded')).toBe('true')
  document.body.click()
  expect(document.activeElement).toBe(input)
  expect(input.getAttribute('aria-expanded')).toBe('false')
  stop()
})

test.each([undefined, 'invalid-url'])('manual sign-in works without a usable AppView (%s)', async appViewUrl => {
  const { node, input, start, stop } = mount(appViewUrl)
  typeHandle(input, 'alice.example')
  await vi.runOnlyPendingTimersAsync()
  expect(search).not.toHaveBeenCalled()
  expect(node.querySelector('[role="listbox"]')).toBeNull()
  submit(node)
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ input: 'alice.example' }))
  stop()
})

test.each([
  ['network errors', () => Promise.reject(new TypeError('Network failure'))],
  ['HTTP errors', async () => new Response(null, { status: 503 })],
  ['invalid JSON', async () => new Response('{')],
] as const)('manual sign-in remains available after %s', async (_, respond) => {
  search.mockImplementationOnce(respond)
  const { node, input, start, flow, stop } = mount(appViewUrl)
  typeHandle(input, 'alice.example')
  await vi.runOnlyPendingTimersAsync()
  expect(search).toHaveBeenCalledOnce()
  expect(input.getAttribute('aria-expanded')).toBe('false')
  expect(input.disabled).toBe(false)
  expect(flow.getState().error).toBeUndefined()
  submit(node)
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ input: 'alice.example' }))
  stop()
})

test('a pending lookup cannot delay manual sign-in and is canceled when the form submits', async () => {
  const resolve = deferSearch()
  const { node, input, start, stop } = mount(appViewUrl)
  typeHandle(input, 'alice.example')
  await vi.runOnlyPendingTimersAsync()
  expect(node.hasAttribute('aria-busy')).toBe(false)
  submit(node)
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ input: 'alice.example' }))
  expect(search.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  resolve(Response.json({ actors: [{ handle: 'alice.example' }] }))
  await vi.runOnlyPendingTimersAsync()
  expect(node.querySelector('[role="option"]')).toBeNull()
  stop()
})

test('a stalled AppView lookup expires and manual sign-in still works', async () => {
  search.mockImplementationOnce((_url, options) => new Promise<Response>((_resolve, reject) => {
    const signal = options!.signal!
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const { node, input, start, stop } = mount(appViewUrl)
  typeHandle(input, 'alice.example')
  await vi.advanceTimersByTimeAsync(200)
  const signal = search.mock.calls[0]?.[1]?.signal
  expect(signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(5000)
  expect(signal?.aborted).toBe(true)
  expect(input.disabled).toBe(false)
  expect(input.getAttribute('aria-expanded')).toBe('false')
  node.querySelector<HTMLButtonElement>('[type="submit"]')!.click()
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ intent: 'signin', input: 'alice.example' }))
  stop()
})

test('later input, dismissal and navigation discard obsolete lookups', async () => {
  const resolve = deferSearch()
  search.mockResolvedValueOnce(Response.json({ actors: [{ handle: 'bob.example' }] }))
  const { node, input, flow, stop } = mount(appViewUrl)
  typeHandle(input, 'alice')
  await vi.runOnlyPendingTimersAsync()
  typeHandle(input, 'bob')
  expect(search.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  await vi.runOnlyPendingTimersAsync()
  expect(node.querySelector('[role="option"]')?.textContent).toBe('@bob.example')
  resolve(Response.json({ actors: [{ handle: 'alice.example' }] }))
  await vi.runOnlyPendingTimersAsync()
  expect(node.querySelector('[role="option"]')?.textContent).toBe('@bob.example')
  expect(press(input, 'Escape').defaultPrevented).toBe(true)
  expect(input.value).toBe('bob')
  expect(node.querySelector('[role="option"]')).toBeNull()
  typeHandle(input, 'charlie')
  flow.showSignup()
  await vi.runOnlyPendingTimersAsync()
  expect(search).toHaveBeenCalledTimes(2)
  stop()
})

test('DIDs skip autocomplete and still go through normal sign-in', async () => {
  const { node, input, start, stop } = mount(appViewUrl)
  const did = 'did:web:identity.example:user'
  typeHandle(input, did)
  await vi.runOnlyPendingTimersAsync()
  expect(search).not.toHaveBeenCalled()
  submit(node)
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ input: did }))
  stop()
})
