// Fruits and temporary buffs, shared by the game and the progression simulator (scripts/simulate.mjs).
// Times are in milliseconds: performance.now() in the game, simulated time in the simulator.

// In the order of their odds: with N fruit levels, only the first N (at most 16) can appear.
export const FRUITS = [
  ...['apple', 'orange', 'banana', 'lemon', 'strawberry', 'cherry', 'peach', 'grape', 'pear', 'blueberry'],
  ...['ananas', 'pomegranate', 'lime', 'kiwi', 'coconut', 'watermelon'],
]
// Fruit -> temporary buff it grants: [buff, value, seconds (FRUIT_BUFF_DURATION if left out)].
export const FRUIT_BUFFS = {
  apple: ['expGain', 2],
  orange: ['moneyGain', 2],
  banana: ['criticalBoth', 1.5],
  lemon: ['storyChance', 1.5],
  strawberry: ['progressCircle', 2],
  cherry: ['eventChance', 1.5],
  peach: ['fullFocus', 2],
  grape: ['discount', 20],
  pear: ['fruitFactor', 1.2],
  blueberry: ['quizzChance', 1.2],
  ananas: ['storyBonusBoost', 2], // active story bonuses count twice
  pomegranate: ['criticalBonus', 40, 20], // critical points added
  lime: ['eventReward', 2], // rewards of the events started meanwhile
  kiwi: ['combo', 3], // score +5% per hit in a row, up to this, back to x1 on a miss
  coconut: ['magnet', 1], // fruits are caught by themselves (or the black chest curse is lifted, see game.js)
  watermelon: ['seeds', 0.5], // a miss still brings this share of a hit; timed challenges last longer
}
export const FRUIT_BUFF_DURATION = 60
export const COMBO_STEP = 0.05
export const SEEDS_EXTRA_TIME = 10 // seconds added to timed challenges while seeds (watermelon) are active
// Buffs extended past this many seconds level up (up to LIMITS.maxLevel): stronger, but their timer is cut back.
const BUFF_LEVEL_UP_THRESHOLD = 300
const BUFF_LEVEL_UP_CUT = 240
// How fruits and buff level-ups are limited. Exported for the simulator, which can try other limits.
// The Java version had no limit: x1.2 the current value at each level-up and a fruit on any click. Pears (more
// fruits) leveling up brought more fruits, more level-ups... and the game ran away within the hour, all the more
// with auto-fire (scripts/simulate.mjs).
// levelUp: "linear" (+20% of the first value per level) or "compound" (x1.2 the current value, as in Java).
// fruitCooldown: seconds after a fruit during which no other fruit appears, whatever the click rate.
export const LIMITS = { levelUp: 'linear', maxLevel: 5, fruitCooldown: 5 }

// Chance (0 to 1) that a click throws a fruit, and which one, from a roll of 0 to 1.
export const fruitChance = (fruitFactor) => fruitFactor / 1000
export const pickFruit = (fruitFactor, roll) => FRUITS[Math.floor(roll * Math.min(fruitFactor, FRUITS.length))]

// Value of an active buff, or undefined.
export const buffValue = (buffs, name) => buffs.find((entry) => entry.name === name)?.value

// Score multiplier of the combo (kiwi), after this many hits in a row.
export function comboFactor(buffs, hitsInARow) {
  const limit = buffValue(buffs, 'combo')
  return limit ? Math.min(1 + COMBO_STEP * hitsInARow, limit) : 1
}

// Buffs count down in real time, from the moment they were obtained.
export function countDown(entry, now) {
  entry.duration -= (now - entry.countedAt) / 1000
  entry.countedAt = now
}

// Adds a buff, or extends it if already active. Returns true when that extension leveled it up.
export function addBuff(buffs, { name, description, value, duration }, now) {
  const existing = buffs.find((entry) => entry.name === name)
  if (!existing) {
    buffs.push({ name, description, value, firstValue: value, duration, level: 1, countedAt: now })
    return false
  }
  countDown(existing, now)
  existing.duration += duration
  if (existing.duration <= BUFF_LEVEL_UP_THRESHOLD) return false
  existing.duration -= BUFF_LEVEL_UP_CUT
  if (existing.level >= LIMITS.maxLevel) return false
  existing.level++
  if (LIMITS.levelUp === 'linear') existing.value = existing.firstValue * (1 + 0.2 * (existing.level - 1))
  else existing.value *= 1.2
  return true
}

// Counts all buffs down and removes the finished ones.
export function expireBuffs(buffs, now) {
  for (let i = buffs.length - 1; i >= 0; i--) {
    countDown(buffs[i], now)
    if (buffs[i].duration < 0) buffs.splice(i, 1)
  }
}

// Click multipliers, from the error count, the buffs and the story bonuses (storyBonuses(bonus): how many are active).
export function buffMultipliers(state, buffs, storyBonuses) {
  const penalty = 1 / (state.errorNumber + 1)
  const multipliers = {
    xp: penalty * Math.pow(2, storyBonuses('xpboost')),
    money: penalty,
    criticalChance: penalty,
    criticalPower: penalty,
    standardHit: 100,
    fruitFactor: penalty,
    criticalBonus: 0,
    missShare: 0,
  }
  for (const entry of buffs) {
    if (entry.name === 'expGain') multipliers.xp *= entry.value
    else if (entry.name === 'moneyGain') multipliers.money *= entry.value
    else if (entry.name === 'criticalBoth') {
      multipliers.criticalChance *= entry.value
      multipliers.criticalPower *= entry.value
    } else if (entry.name === 'CURSED') multipliers.standardHit -= state.power + state.errorNumber + 20
    else if (entry.name === 'fullFocus') multipliers.standardHit = 500 / (state.errorNumber + 1)
    else if (entry.name === 'fruitFactor') multipliers.fruitFactor *= entry.value
    else if (entry.name === 'criticalBonus') multipliers.criticalBonus += entry.value
    else if (entry.name === 'seeds') multipliers.missShare = Math.min(entry.value, 1)
  }
  return multipliers
}

// Price factor (1 = full price). Grapes and story bonuses lower prices, a curse raises them.
// Never under 10% of the price: grapes grow stronger as they level up, and went past 100% off (negative prices).
const MIN_PRICE_PERCENT = 10

export function buffDiscount(buffs, storyBonuses) {
  let percent = 100 - 10 * storyBonuses('discount10')
  for (const entry of buffs) {
    if (entry.name === 'discount') percent -= entry.value
    else if (entry.name === 'CURSED') percent += entry.value * 10
  }
  return Math.max(percent, MIN_PRICE_PERCENT) / 100
}
