import defaultStyles from '../styles.css?inline'

export interface StyleOptions {
  /** Skip the built-in stylesheet and leave presentation entirely to the client. */
  unstyled?: boolean
  /** Nonce for the built-in style element when the client uses a Content Security Policy. */
  nonce?: string
}

/** Keep styles with the instance so detached components also work when placed in a shadow root. */
export function styleComponent(root: HTMLElement, options: StyleOptions): HTMLStyleElement | undefined {
  if (options.unstyled) {
    root.removeAttribute('data-launcher-style')
    return
  }
  root.dataset.launcherStyle = 'default'
  const style = root.ownerDocument.createElement('style')
  if (options.nonce) style.nonce = options.nonce
  style.textContent = defaultStyles
  return style
}
