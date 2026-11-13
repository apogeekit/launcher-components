import defaultStyles from '../styles.css?inline'

export interface StyleOptions {
  /** Omit for the fixed default, supply CSS text to replace it, or false for external CSS/raw markup. */
  stylesheet?: string | false
  /** Nonce for the selected style element when the client uses a Content Security Policy. */
  nonce?: string
}

/** Keep styles with the instance so detached components also work when placed in a shadow root. */
export function styleComponent(root: HTMLElement, options: StyleOptions): HTMLStyleElement | undefined {
  if (options.stylesheet === false) {
    root.removeAttribute('data-launcher-style')
    return
  }
  root.dataset.launcherStyle = options.stylesheet === undefined ? 'default' : 'custom'
  const style = root.ownerDocument.createElement('style')
  if (options.nonce) style.nonce = options.nonce
  style.textContent = options.stylesheet ?? defaultStyles
  return style
}
