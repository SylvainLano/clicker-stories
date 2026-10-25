// Everything the game saves. Field names match the Java save, because story texts use them as
// placeholders (e.g. "{clickNumber}" in the statistics blocks).
const SAVE_KEY = 'clicker-stories.save'
const SAVE_VERSION = 1

const SET_FIELDS = [
  'readStoryBlockIds',
  'answeredQuizzBlockIds',
  'startedStoryIds',
  'finishedStoryIds',
  'finishedQuizzIds',
  'unlockedAchievementIds',
  'activatedStoryBonus',
]

export function createState() {
  return {
    lang: 'en',
    // Progression
    score: 0,
    money: 0,
    exp: 0,
    level: 1,
    power: 1,
    focus: 1,
    critical: 0,
    criticalPower: 2,
    moneyGain: 1,
    experienceGain: 1,
    fruitFactor: 0,
    storyBonus: 0,
    autoClickingLevel: 0,
    errorNumber: 0,
    // Statistics
    clickNumber: 0,
    autoClickNumber: 0,
    criticalHits: 0,
    autoCriticalHits: 0,
    moneySpent: 0,
    oneWordTotal: 0,
    paragraphTotal: 0,
    longTextTotal: 0,
    inGameTime: 0,
    maxClicksSecond: 0,
    appearedFruits: 0,
    touchedFruits: 0,
    extendedBonuses: 0,
    goodAnswers: 0,
    badAnswers: 0,
    emptyChests: 0,
    regularChests: 0,
    goldChests: 0,
    whiteChests: 0,
    blackChests: 0,
    eventsWon: 0,
    eventsLost: 0,
    // Story progress
    ...Object.fromEntries(SET_FIELDS.map((field) => [field, new Set()])),
  }
}

export function saveState(state) {
  const data = { version: SAVE_VERSION }
  for (const [key, value] of Object.entries(state)) data[key] = value instanceof Set ? [...value] : value
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

// Returns null when there is no (readable) save. Fields missing from an older save keep their defaults.
export function loadState() {
  let data
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY))
  } catch {
    return null
  }
  if (!data) return null

  const state = createState()
  for (const key of Object.keys(state)) {
    if (!(key in data)) continue
    state[key] = SET_FIELDS.includes(key) ? new Set(data[key]) : data[key]
  }
  return state
}
