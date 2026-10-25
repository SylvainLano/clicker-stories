import { STARTING_VALUES, upgradeSteps } from './formulas.js'

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
  'caughtFruitKinds',
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
    autoFireLevel: 0,
    errorNumber: 0,
    // Purchases of each upgrade (by state field), which set its next price.
    upgradesBought: Object.fromEntries(Object.keys(STARTING_VALUES).map((field) => [field, 0])),
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
    highestCriticalTier: 0, // 1: single critical, 2: double...
    cursesLifted: 0, // black chest curses lifted by a coconut
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
  // Upgrades added since the save was made start with no purchase.
  const purchases = 'upgradesBought' in data ? data.upgradesBought : estimatePurchases(state)
  state.upgradesBought = { ...createState().upgradesBought, ...purchases }
  return state
}

// Saves from before purchases were counted (version 0.1.0): replays the upgrade steps from the starting values
// up to the saved ones. Rewards that raised a value without a purchase count as purchases, which is close enough.
function estimatePurchases(state) {
  return Object.fromEntries(
    Object.entries(STARTING_VALUES).map(([field, start]) => {
      let purchases = 0
      for (let value = start; value < state[field]; value += upgradeSteps[field](value)) purchases++
      return [field, purchases]
    }),
  )
}
