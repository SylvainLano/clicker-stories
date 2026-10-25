import { assetUrl } from './assets.js'

async function fetchJson(path) {
  const response = await fetch(assetUrl(path))
  if (!response.ok) throw new Error(`Cannot load ${path}`)
  return response.json()
}

export const LANGUAGES = ['en', 'fr']

export const loadData = (file) => fetchJson(`/data/${file}`)

// Localized game data, falling back to English when a file isn't translated.
export async function loadLocalized(lang, file) {
  try {
    return await fetchJson(`/data/lang/${lang}/${file}`)
  } catch {
    return fetchJson(`/data/lang/en/${file}`)
  }
}

// UI texts: t(category, key). English is the reference, the chosen language overrides what it translates.
export async function loadTranslator(lang) {
  const english = await fetchJson('/data/lang/en/ui.json')
  const local = lang === 'en' ? {} : await fetchJson(`/data/lang/${lang}/ui.json`).catch(() => ({}))
  return (category, key) => local[category]?.[key] ?? english[category]?.[key] ?? `MISSING LANG KEY:${category} - ${key}`
}
