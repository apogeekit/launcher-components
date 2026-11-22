import { element } from './elements'
import { isHandle } from './input'
import type { Translate } from './types'

interface HandleSuggestion {
  handle: string
  displayName?: string
  avatar?: string
}

const TYPEAHEAD_PATH = '/xrpc/app.bsky.actor.searchActorsTypeahead'
const HANDLE_QUERY_PATTERN = /^[a-z0-9][a-z0-9.-]{0,252}$/i
const SUGGESTION_LIMIT = 5
const SEARCH_DEBOUNCE_MS = 200
const SEARCH_TIMEOUT_MS = 5_000
const PRIMARY_BUTTON = 0
const NO_ACTIVE_OPTION = -1
const MODIFIER_KEYS = ['Alt', 'Control', 'Meta', 'Shift']

function parseHttpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    if (url.username || url.password) return undefined
    return url
  } catch {
    return undefined
  }
}

function readSuggestions(data: unknown): HandleSuggestion[] {
  if (!data || typeof data !== 'object' || !('actors' in data) || !Array.isArray(data.actors)) return []

  const actors: readonly unknown[] = data.actors
  const suggestions = new Map<string, HandleSuggestion>()
  for (const actor of actors) {
    if (!actor || typeof actor !== 'object' || !('handle' in actor)) continue
    if (typeof actor.handle !== 'string' || !isHandle(actor.handle)) continue
    const handle = actor.handle.toLowerCase()
    if (handle === 'handle.invalid' || suggestions.has(handle)) continue

    const displayName =
      'displayName' in actor && typeof actor.displayName === 'string' ? actor.displayName.trim() : undefined
    const avatar = 'avatar' in actor && typeof actor.avatar === 'string' ? parseHttpUrl(actor.avatar)?.href : undefined
    suggestions.set(handle, { handle, displayName, avatar })
    if (suggestions.size === SUGGESTION_LIMIT) break
  }
  return [...suggestions.values()]
}

async function fetchSuggestions(
  searchUrl: string,
  query: string,
  controller: AbortController,
): Promise<HandleSuggestion[]> {
  const url = new URL(searchUrl)
  url.searchParams.set('q', query)
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!response.ok) {
      controller.abort()
      return []
    }
    const data: unknown = await response.json()
    return controller.signal.aborted ? [] : readSuggestions(data)
  } catch {
    // Manual sign-in remains available when the AppView is unreachable.
    return []
  } finally {
    clearTimeout(timeout)
  }
}

function renderSuggestion(doc: Document, id: string, suggestion: HandleSuggestion): HTMLLIElement {
  const option = element(doc, 'li', '', '', 'handle-suggestion')
  option.id = id
  option.setAttribute('role', 'option')
  option.setAttribute('aria-selected', 'false')

  const avatar = element(doc, 'span', '', '', 'suggestion-avatar')
  if (suggestion.avatar) {
    const image = element(doc, 'img')
    image.alt = ''
    // Standard image loading supports avatar CDNs such as Bluesky's.
    image.referrerPolicy = 'no-referrer'
    image.onerror = () => image.remove()
    image.src = suggestion.avatar
    avatar.append(image)
  }
  const identity = element(doc, 'span', '', '', 'suggestion-identity')
  if (suggestion.displayName) {
    identity.append(element(doc, 'bdi', suggestion.displayName, '', 'suggestion-display-name'))
  }
  const handle = element(doc, 'bdi', `@${suggestion.handle}`, '', 'suggestion-handle')
  handle.dir = 'ltr'
  identity.append(handle)
  option.append(avatar, identity)
  return option
}

export function attachHandleAutocomplete(input: HTMLInputElement, appViewUrl: string, t: Translate) {
  const endpoint = parseHttpUrl(appViewUrl)
  if (!endpoint || endpoint.search || endpoint.hash) return
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + TYPEAHEAD_PATH
  endpoint.searchParams.set('limit', String(SUGGESTION_LIMIT))
  const searchUrl = endpoint.href

  const doc = input.ownerDocument
  const list = element(doc, 'ul', '', '', 'handle-suggestions')
  list.id = `${input.id}-suggestions`
  list.hidden = true
  list.tabIndex = -1
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', t('signin.suggestions'))
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-controls', list.id)
  input.setAttribute('aria-expanded', 'false')
  input.after(list)

  let pendingSearch: { controller: AbortController; debounceTimer: ReturnType<typeof setTimeout> } | undefined
  let suggestions: HandleSuggestion[] = []
  let activeIndex = NO_ACTIVE_OPTION
  let holdingListOpen = false
  let pointerReleaseTimer: ReturnType<typeof setTimeout> | undefined

  function setSuggestions(results: HandleSuggestion[]) {
    setActiveOption(NO_ACTIVE_OPTION)
    suggestions = results
    const options = results.map((suggestion, index) => {
      const option = renderSuggestion(doc, `${list.id}-${index}`, suggestion)
      option.onclick = () => selectSuggestion(suggestion.handle)
      return option
    })
    list.replaceChildren(...options)
    list.hidden = options.length === 0
    input.setAttribute('aria-expanded', String(!list.hidden))
  }

  function setActiveOption(index: number) {
    list.children[activeIndex]?.setAttribute('aria-selected', 'false')
    activeIndex = index
    const option = list.children[index]
    if (!option) {
      input.removeAttribute('aria-activedescendant')
      return
    }
    option.setAttribute('aria-selected', 'true')
    input.setAttribute('aria-activedescendant', option.id)
    option.scrollIntoView({ block: 'nearest' })
  }

  function dismiss() {
    const search = pendingSearch
    pendingSearch = undefined
    clearTimeout(search?.debounceTimer)
    clearTimeout(pointerReleaseTimer)
    holdingListOpen = false
    setSuggestions([])
    search?.controller.abort()
  }

  function selectSuggestion(handle: string) {
    input.value = handle
    dismiss()
    input.focus()
  }

  async function runSearch(query: string, value: string, controller: AbortController) {
    const results = await fetchSuggestions(searchUrl, query, controller)
    if (pendingSearch?.controller !== controller) return
    pendingSearch = undefined
    if (input.value === value && results.length > 0) setSuggestions(results)
  }

  function scheduleSearch() {
    dismiss()
    if (input.disabled || !input.matches(':focus')) return

    const value = input.value
    const prefix = value.trim().replace(/^@/, '')
    if (!HANDLE_QUERY_PATTERN.test(prefix)) return

    const query = prefix.toLowerCase()
    const controller = new AbortController()
    const debounceTimer = setTimeout(() => void runSearch(query, value, controller), SEARCH_DEBOUNCE_MS)
    pendingSearch = { controller, debounceTimer }
  }

  function isInsideAutocomplete(event: Event) {
    const path = event.composedPath()
    if (path.includes(input) || path.includes(list)) return true

    const root = input.getRootNode()
    // Outside a closed shadow root, the event path only exposes its host.
    return 'host' in root && !path.includes(root) && path.some(target => target === root.host)
  }

  function holdListOpen(event: MouseEvent) {
    if (list.hidden || event.button !== PRIMARY_BUTTON) return
    clearTimeout(pointerReleaseTimer)
    holdingListOpen = true
  }

  function releaseList() {
    if (!holdingListOpen) return
    clearTimeout(pointerReleaseTimer)
    // Keep the target in place until its click handler can run.
    pointerReleaseTimer = setTimeout(() => {
      holdingListOpen = false
      if (!input.matches(':focus')) dismiss()
    }, 0)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    const { key } = event
    if (key === 'Escape') {
      if (list.hidden && !pendingSearch) return
      if (!list.hidden) event.preventDefault()
      dismiss()
      return
    }

    const hasModifier = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
    const suggestion = suggestions[activeIndex]
    if (!hasModifier && key === 'Enter' && suggestion) {
      event.preventDefault()
      selectSuggestion(suggestion.handle)
      return
    }
    if (!hasModifier && !list.hidden && key === 'ArrowDown') {
      event.preventDefault()
      setActiveOption(Math.min(activeIndex + 1, suggestions.length - 1))
      return
    }
    if (!hasModifier && !list.hidden && key === 'ArrowUp') {
      event.preventDefault()
      const index = activeIndex === NO_ACTIVE_OPTION ? suggestions.length : activeIndex
      setActiveOption(Math.max(index - 1, 0))
      return
    }
    if (suggestion && !MODIFIER_KEYS.includes(key)) setActiveOption(NO_ACTIVE_OPTION)
  }

  const listeners = new AbortController()
  const events = { signal: listeners.signal }
  const capture = { ...events, capture: true }

  input.addEventListener('input', event => {
    if (event.isComposing) dismiss()
    else scheduleSearch()
  }, events)
  input.addEventListener('compositionstart', dismiss, events)
  input.addEventListener('compositionend', scheduleSearch, events)
  input.addEventListener('keydown', handleKeydown, events)
  input.addEventListener('pointerdown', () => {
    if (activeIndex !== NO_ACTIVE_OPTION) setActiveOption(NO_ACTIVE_OPTION)
  }, events)
  input.addEventListener('blur', () => {
    if (!holdingListOpen) dismiss()
  }, events)
  list.addEventListener('mousedown', event => {
    if (event.button === PRIMARY_BUTTON) event.preventDefault()
  }, events)

  // Touch can dispatch pointer events followed by synthesized mouse events.
  doc.addEventListener('pointerdown', event => {
    if (pendingSearch && !isInsideAutocomplete(event)) dismiss()
    holdListOpen(event)
  }, capture)
  doc.addEventListener('pointerup', releaseList, capture)
  doc.addEventListener('pointercancel', releaseList, capture)
  doc.addEventListener('mousedown', holdListOpen, capture)
  doc.addEventListener('mouseup', releaseList, capture)
  doc.addEventListener('click', event => {
    if ((pendingSearch || !list.hidden) && !isInsideAutocomplete(event)) dismiss()
  }, capture)

  return {
    dismiss,
    destroy() {
      listeners.abort()
      dismiss()
      list.remove()
    },
  }
}
