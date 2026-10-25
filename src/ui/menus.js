import { element } from './dom.js'

// A full-screen overlay with a scrollable panel and a close button (MenuPane / DisplayPane in Java).
// `panelClass` gives the panel its look (e.g. planks for the options).
export function createMenuPane(stage, { panelClass, onClose }) {
  const box = element('div', 'menu-box')
  const panel = element('div', `menu-panel ${panelClass}`, '', box)
  const closeButton = element('button', 'close-button')
  const overlay = element('div', 'menu-overlay', '', panel, closeButton)
  overlay.hidden = true
  stage.append(overlay)

  const pane = {
    box,
    get isOpen() {
      return !overlay.hidden
    },
    open() {
      overlay.hidden = false
    },
    close() {
      overlay.hidden = true
      onClose?.()
    },
  }
  closeButton.addEventListener('click', () => pane.close())
  return pane
}
