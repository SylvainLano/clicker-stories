// Game formulas, ported from the Java version.
// Java used integers: its divisions and casts truncated. Those truncations are kept wherever they shape
// the game balance (costs, upgrades, levels). Temporary multipliers (buffs) are real decimals instead.

const XP_BASE = 0.34877

// Integer division, as Java did it with ints.
export const idiv = (a, b) => Math.trunc(a / b)

// Upgrades, by state field: their value at the start of a game, and the price of their first purchase.
export const STARTING_VALUES = {
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
}
// Exported for the simulator, which can try other prices (--price).
export const FIRST_PRICES = {
  power: 100,
  focus: 10000,
  critical: 750,
  criticalPower: 250,
  moneyGain: 600,
  experienceGain: 5000,
  fruitFactor: 15000,
  storyBonus: 100000,
  autoClickingLevel: 200,
  autoFireLevel: 100000,
}
// Each purchase of an upgrade costs this many times the previous one: progress slows down to a wall
// after about 2 hours, which pushes the player to prestige (checked with scripts/simulate.mjs).
const COST_GROWTH = 1.8


// Cost of the next purchase of each upgrade (by state field), after the discount (1 = full price).
export function upgradeCosts(state, discount) {
  return Object.fromEntries(
    Object.entries(FIRST_PRICES).map(([field, price]) => [
      field,
      Math.trunc(discount * Math.round(price * COST_GROWTH ** state.upgradesBought[field])),
    ]),
  )
}

// What buying one more level adds to each upgrade.
export const upgradeSteps = {
  power: (value) => idiv(value, 10) + 1,
  focus: (value) => idiv(value, 10) + 1,
  critical: () => 1,
  criticalPower: (value) => idiv(value, 10) + 1,
  moneyGain: (value) => idiv(value, 10) + 1,
  experienceGain: () => 1,
  fruitFactor: () => 1,
  storyBonus: () => 1,
  autoClickingLevel: () => 1,
  autoFireLevel: () => 1,
}

export function experienceForLevel(level) {
  return level === 1 ? 0 : Math.trunc(Math.exp((level - 1) / XP_BASE) - 1 + XP_BASE * 150)
}

// NaN for small amounts of experience (as in Java, where it then counted as no level up).
export function levelForExperience(experience) {
  return Math.trunc(XP_BASE * Math.log(experience - XP_BASE * 150 + 1) + 1)
}

// Seconds between two automatic clicks: from 3s, decaying exponentially, never under 0.1s.
export function autoClickingDelay(autoClickingLevel) {
  return Math.max(3 * Math.exp(-0.2 * (autoClickingLevel - 1)), 0.1)
}

// Clicks per second while the space bar is held: one every 2 seconds without the upgrade, then 2 per second and
// one more per level, with no limit (holding the space bar is meant to reach inhuman rates). It grows linearly:
// growing by a factor per level, it outran the x1.8 costs and broke the 2-hour wall (scripts/simulate.mjs).
export function autoFireRate(autoFireLevel) {
  return autoFireLevel === 0 ? 0.5 : autoFireLevel + 1
}

// 4999, then 5.0K... 4999.9K, then 5.0M...: each unit takes over at 5 of it. Beyond the last unit,
// scientific notation (1.23e36). The Java version stopped at B, so late costs read like "10316356453.9B".
const NUMBER_UNITS = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']

export function formatNumber(number) {
  if (!Number.isFinite(number)) return '∞'
  if (number < 5000) return String(Math.trunc(number))
  if (number >= 5 * 1000 ** (NUMBER_UNITS.length + 1)) {
    const [mantissa, exponent] = number.toExponential(2).split('e+')
    return `${mantissa}e${exponent}`
  }
  let unit = -1
  while (unit < NUMBER_UNITS.length - 1 && number >= 5 * 1000 ** (unit + 2)) unit++
  return `${(number / 1000 ** (unit + 1)).toFixed(1)}${NUMBER_UNITS[unit]}`
}
