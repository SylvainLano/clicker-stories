import { listAssets, pickRandom } from '../assets.js'
import { loadData, loadLocalized } from '../data.js'
import { formatNumber } from '../game/formulas.js'

// Kinds of content the story area can show.
export const CONTENT = {
  STORY: 'STORY',
  FACTS: 'FACTS',
  JOKES: 'JOKES',
  STATS: 'STATS',
  MESSAGE: 'MESSAGE',
  TIMED: 'TIMED', // timed challenges
  STATIC: 'STATIC', // reflex test and chests
  QUIZZ: 'QUIZZ',
}

export const NIGHT_SKY = '/images/backgrounds/night_sky.webp'
export const AMBIENT_MUSIC = { file: 'Dar Golan Free Night Nature Soundscape.mp3', credits: 'Dar Golan - Free Night Nature Soundscape' }

// Music for blocks that don't choose their own.
const DEFAULT_MUSIC = {
  FACTS: { file: 'Infraction-Patience.mp3', credits: 'Infraction - Patience', volume: 0.2 },
  JOKES: { file: 'Instrumental Piano Soul Blues.mp3', credits: 'Fahmi AR Project - Instrumental Piano Soul Blues' },
  TIMED: { file: 'Karl Casey @ White Bat Audio - Speed Kills.mp3', credits: 'Karl Casey @ White Bat Audio - Speed Kills' },
  STATIC: { file: 'Bihler - In the 1980s.mp3', credits: 'Bihler - In the 1980s' },
}

const fileName = (path) => path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'))

// Loads every content file up front, so the story engine never waits for the network.
export async function loadContent(lang) {
  const names = listAssets('data/lang/en/', '.json').map(fileName)
  const entries = await Promise.all(names.map(async (name) => [name, await loadLocalized(lang, `${name}.json`)]))
  return {
    files: new Map(entries),
    storyFiles: names.filter((name) => name.startsWith('storyBlock')),
    quizzFiles: names.filter((name) => name.startsWith('quizzBlock')),
    config: await loadData('story_config.json'),
    factsBackgrounds: listAssets('images/backgrounds/facts/'),
    jokesBackgrounds: listAssets('images/backgrounds/jokes/'),
  }
}

export function formatPlaytime(totalSeconds) {
  const seconds = Math.round(totalSeconds)
  const pad = (value) => String(value).padStart(2, '0')
  const [hours, minutes, rest] = [Math.trunc(seconds / 3600), Math.trunc((seconds % 3600) / 60), seconds % 60]
  return hours > 0
    ? `${pad(hours)} hours, ${pad(minutes)} minutes, ${pad(rest)} seconds`
    : `${pad(minutes)} minutes, ${pad(rest)} seconds`
}

// "{clickNumber}" -> the player's number of clicks, for every saved statistic.
function fillPlaceholders(text, state) {
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    if (key === 'inGameTime') return formatPlaytime(state.inGameTime)
    const value = state[key]
    if (typeof value === 'number') return formatNumber(value)
    return typeof value === 'string' ? value : match
  })
}

// Fresh copies of a file's blocks (events modify their blocks while they run), with defaults filled in.
export function prepareBlocks(content, file, type, state) {
  const raw = content.files.get(file) ?? []
  return raw.map((source) => {
    const block = structuredClone(source)
    block.text = fillPlaceholders(block.text ?? '', state)
    if (!block.backgroundPath) {
      if (type === CONTENT.FACTS) block.backgroundPath = pickRandom(content.factsBackgrounds)
      else if (type === CONTENT.JOKES) block.backgroundPath = pickRandom(content.jokesBackgrounds)
      else block.backgroundPath = NIGHT_SKY
    }
    if (!block.musicPath) {
      const music = DEFAULT_MUSIC[type] ?? AMBIENT_MUSIC
      block.musicPath = music.file
      block.musicCredits = music.credits
      if (music.volume) block.musicVolume = music.volume
    }
    if (!(block.delay > 0)) block.delay = 10
    if (!(block.musicVolume > 0)) block.musicVolume = 0.5
    block.weight ??= 0
    return block
  })
}

// Cursors and main button skin of a story ("storyBlockUplifting1"), else of its kind ("storyBlockUplifting"),
// else the default. Events use it too ("greenEvent", "redEvent").
export function storyConfig(content, id) {
  const config = content.config
  const kind = id.replace(/\d+$/, '')
  const specific = [config[id], config[kind]].find((entry) => entry?.hoverCursor)
  return specific ?? config.default
}
