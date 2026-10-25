import { assetUrl } from './assets.js'

// Exposes every image of the manifest to CSS as a custom property, so stylesheets don't hard-code asset URLs
// (which depend on where the game is hosted). "/images/buttons/close-button.webp" -> var(--img-buttons-close-button)
export function defineImageVariables(manifest) {
  const root = document.documentElement.style
  for (const path of manifest) {
    if (!path.startsWith('/images/')) continue
    const name = path
      .slice('/images/'.length)
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
    root.setProperty(`--img-${name}`, `url("${assetUrl(path)}")`)
  }
}
