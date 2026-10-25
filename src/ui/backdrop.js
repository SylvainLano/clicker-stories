import { element } from './dom.js'

const FADE = 2000

// The page around the 800x600 stage shows the stage's current background, blurred and darkened,
// cross-fading whenever it changes.
export function createBackdrop(container) {
  let current = null
  let currentUrl = null

  return {
    show(url) {
      if (url === currentUrl) return
      currentUrl = url
      const layer = element('div', 'backdrop-layer')
      layer.style.backgroundImage = `url("${url}")`
      container.append(layer)
      const previous = current
      current = layer
      if (!previous) return
      layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE })
      previous.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, fill: 'forwards' }).finished.then(() => previous.remove())
    },
  }
}
