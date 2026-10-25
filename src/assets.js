// Asset paths look like "/images/backgrounds/night_sky.webp", relative to public/assets.
const ASSETS_ROOT = `${import.meta.env.BASE_URL}assets`

let paths = []

export async function loadManifest() {
  const response = await fetch(assetUrl('/manifest.json'))
  paths = await response.json()
}

export const manifest = () => paths

export function assetUrl(path) {
  return ASSETS_ROOT + path.split('/').map(encodeURIComponent).join('/')
}

// An asset path, or a file already loaded in memory (blob: or data: URL), which is kept as it is.
export function resolveUrl(pathOrUrl) {
  return /^(blob|data):/.test(pathOrUrl) ? pathOrUrl : assetUrl(pathOrUrl)
}

// Lists the asset paths inside a folder, optionally filtered by extension (".wav", ".json"...).
export function listAssets(folder, extension) {
  const prefix = `/${folder.replace(/^\/|\/$/g, '')}/`
  return paths.filter(
    (path) => path.startsWith(prefix) && (!extension || path.toLowerCase().endsWith(extension.toLowerCase())),
  )
}

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)]
}
