import { element } from './elements'
import { isHandle } from './input'
import type { Translate } from './types'

interface HandleSuggestion {
  handle: string
  displayName?: string
  avatar?: string
}

const suggestionLimit = 5

function httpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url
  } catch {
    /* A malformed AppView or avatar URL can be omitted. */
  }
}

function readSuggestions(data: unknown): HandleSuggestion[] {
  if (typeof data !== 'object' || !data || !('actors' in data) || !Array.isArray(data.actors)) return []
  const suggestions = new Map<string, HandleSuggestion>()
  for (const actor of data.actors as unknown[]) {
    if (typeof actor !== 'object' || !actor || !('handle' in actor) || typeof actor.handle !== 'string') continue
    if (!isHandle(actor.handle)) continue
    const handle = actor.handle.toLowerCase()
    if (handle === 'handle.invalid' || suggestions.has(handle)) continue
    const displayName =
      'displayName' in actor && typeof actor.displayName === 'string' ? actor.displayName.trim() : undefined
    const avatar = 'avatar' in actor && typeof actor.avatar === 'string' ? httpUrl(actor.avatar)?.href : undefined
    suggestions.set(handle, { handle, displayName, avatar })
    if (suggestions.size === suggestionLimit) break
  }
  return [...suggestions.values()]
}

export function attachHandleAutocomplete(input: HTMLInputElement, appViewUrl: string, t: Translate) {
  const endpoint = httpUrl(appViewUrl)
  if (!endpoint || endpoint.search || endpoint.hash) return
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/xrpc/app.bsky.actor.searchActorsTypeahead`
  endpoint.searchParams.set('limit', String(suggestionLimit))
  const searchUrl = endpoint.href

  const doc = input.ownerDocument
  const list = element(doc, 'ul', '', '', 'handle-suggestions')
  list.id = `${input.id}-suggestions`
  list.hidden = true
  list.tabIndex = -1
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', t('signin.suggestions'))
  list.onmousedown = event => {
    if (event.button === 0) event.preventDefault()
  }
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-controls', list.id)
  input.setAttribute('aria-expanded', 'false')
  input.after(list)

  const listeners = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let blurTimer: ReturnType<typeof setTimeout> | undefined
  let pressing = false
  let lookup: AbortController | undefined
  let suggestions: HandleSuggestion[] = []
  let activeIndex = -1

  function dismiss() {
    clearTimeout(timer)
    clearTimeout(blurTimer)
    pressing = false
    lookup?.abort()
    lookup = undefined
    suggestions = []
    activeIndex = -1
    list.hidden = true
    list.replaceChildren()
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
  }

  function select(handle: string) {
    input.value = handle
    dismiss()
    input.focus()
  }

  function activate(index: number) {
    list.children[activeIndex]?.setAttribute('aria-selected', 'false')
    activeIndex = index
    const option = list.children[index]
    if (option) {
      option.setAttribute('aria-selected', 'true')
      input.setAttribute('aria-activedescendant', option.id)
      option.scrollIntoView({ block: 'nearest' })
    } else input.removeAttribute('aria-activedescendant')
  }

  function renderSuggestion(suggestion: HandleSuggestion, index: number) {
    const option = element(doc, 'li', '', '', 'handle-suggestion')
    option.id = `${list.id}-${index}`
    option.setAttribute('role', 'option')
    option.setAttribute('aria-selected', 'false')
    option.onclick = () => select(suggestion.handle)

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
    if (suggestion.displayName)
      identity.append(element(doc, 'bdi', suggestion.displayName, '', 'suggestion-display-name'))
    const handle = element(doc, 'bdi', `@${suggestion.handle}`, '', 'suggestion-handle')
    handle.dir = 'ltr'
    identity.append(handle)
    option.append(avatar, identity)
    return option
  }

  async function search(query: string, value: string, request: AbortController) {
    const url = new URL(searchUrl)
    url.searchParams.set('q', query)
    const deadline = setTimeout(() => request.abort(), 5000)
    try {
      const response = await fetch(url, { signal: request.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok) {
        request.abort()
        return
      }
      const data: unknown = await response.json()
      if (request.signal.aborted || input.value !== value) return
      suggestions = readSuggestions(data)
      if (!suggestions.length) return
      list.replaceChildren(...suggestions.map(renderSuggestion))
      list.hidden = false
      input.setAttribute('aria-expanded', 'true')
    } catch {
      /* Sign-in remains available when typeahead is unavailable. */
    } finally {
      clearTimeout(deadline)
      if (lookup === request) lookup = undefined
    }
  }

  function scheduleSearch(event: Event) {
    dismiss()
    if (input.disabled || !input.matches(':focus') || (event as InputEvent).isComposing) return
    const value = input.value
    const query = value.trim().replace(/^@/, '')
    if (!/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(query)) return
    const request = new AbortController()
    lookup = request
    timer = setTimeout(() => void search(query.toLowerCase(), value, request), 200)
  }
  input.addEventListener('input', scheduleSearch, { signal: listeners.signal })
  input.addEventListener('compositionstart', dismiss, { signal: listeners.signal })
  input.addEventListener('compositionend', scheduleSearch, { signal: listeners.signal })
  input.addEventListener('pointerdown', () => {
    if (activeIndex !== -1) activate(-1)
  }, { signal: listeners.signal })

  function isInsideAutocomplete(event: Event) {
    const path = event.composedPath()
    if (path.includes(input) || path.includes(list)) return true
    const root = input.getRootNode() as Document | ShadowRoot
    // A closed shadow root exposes its host in the path.
    return 'host' in root && !path.includes(root) && path.includes(root.host)
  }

  // Keep controls in place through both pointer and synthesized mouse events.
  const capture = { capture: true, signal: listeners.signal }
  function holdOpen(event: MouseEvent) {
    if (list.hidden || event.button !== 0) return
    clearTimeout(blurTimer)
    pressing = true
  }
  function release() {
    if (!pressing) return
    clearTimeout(blurTimer)
    blurTimer = setTimeout(() => {
      pressing = false
      if (!input.matches(':focus')) dismiss()
    }, 0)
  }
  doc.addEventListener('pointerdown', event => {
    if (lookup && !isInsideAutocomplete(event)) dismiss()
    holdOpen(event)
  }, capture)
  doc.addEventListener('pointerup', release, capture)
  doc.addEventListener('pointercancel', release, capture)
  doc.addEventListener('mousedown', holdOpen, capture)
  doc.addEventListener('mouseup', release, capture)
  doc.addEventListener('click', event => {
    if ((lookup || !list.hidden) && !isInsideAutocomplete(event)) dismiss()
  }, capture)
  input.addEventListener('blur', () => {
    if (!pressing) dismiss()
  }, { signal: listeners.signal })

  input.addEventListener(
    'keydown',
    event => {
      if (event.isComposing) return
      const modified = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
      const suggestion = suggestions[activeIndex]
      if (event.key === 'Escape' && (lookup || !list.hidden)) {
        if (!list.hidden) event.preventDefault()
        dismiss()
      } else if (!list.hidden && !modified && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault()
        if (event.key === 'ArrowDown') activate(Math.min(activeIndex + 1, suggestions.length - 1))
        else activate(activeIndex === -1 ? suggestions.length - 1 : Math.max(activeIndex - 1, 0))
      } else if (event.key === 'Enter' && !modified && suggestion) {
        event.preventDefault()
        select(suggestion.handle)
      } else if (suggestion && !['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) activate(-1)
    },
    { signal: listeners.signal },
  )

  return {
    dismiss,
    destroy() {
      listeners.abort()
      dismiss()
      list.remove()
    },
  }
}
