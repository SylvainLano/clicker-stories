// Asset paths look like "/images/backgrounds/night_sky.webp", relative to public/assets.
const ASSETS_ROOT = `${import.meta.env.BASE_URL}assets`

let manifest = []

export async function loadManifest() {
  const response = await fetch(assetUrl('/manifest.json'))
  manifest = await response.json()
}

export function assetUrl(path) {
  return ASSETS_ROOT + path.split('/').map(encodeURIComponent).join('/')
}

// Lists the asset paths inside a folder, optionally filtered by extension (".wav", ".json"...).
export function listAssets(folder, extension) {
  const prefix = `/${folder.replace(/^\/|\/$/g, '')}/`
  return manifest.filter(
    (path) => path.startsWith(prefix) && (!extension || path.toLowerCase().endsWith(extension.toLowerCase())),
  )
}

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)]
}
