// Game formulas, ported from the Java version.
// Java used integers: its divisions and casts truncated. Those truncations are kept wherever they shape
// the game balance (costs, upgrades, levels). Temporary multipliers (buffs) are real decimals instead.

const XP_BASE = 0.34877

// Integer division, as Java did it with ints.
export const idiv = (a, b) => Math.trunc(a / b)

// Cost of the next level of each upgrade, after the discount (1 = full price).
export function upgradeCosts(state, discount) {
  const { power, focus, critical, criticalPower, moneyGain, experienceGain, fruitFactor, storyBonus, autoClickingLevel } =
    state
  const price = (cost) => Math.trunc(discount * Math.round(cost))
  return {
    power: price(100 * Math.pow(power + idiv(power, 10), Math.log(power))),
    focus: price(10000 * Math.pow(focus + idiv(focus, 10), Math.log(Math.pow(focus, 2)))),
    critical: price(750 * Math.pow(critical + 1, 3)),
    criticalPower: price(250 * (idiv(criticalPower, 10) + 1) * Math.pow(criticalPower + idiv(criticalPower, 10), 2)),
    moneyGain: price(600 * (Math.round(moneyGain / 10) + 1) * Math.pow(moneyGain + Math.round(moneyGain / 10), 2)),
    experienceGain: price(5000 * Math.pow(experienceGain, 2)),
    fruitFactor: price(15000 * Math.pow(fruitFactor + 1, 2.5)),
    storyBonus: price(100000 * Math.pow(storyBonus + 1, 3)),
    autoClicking: price(200 * Math.pow(autoClickingLevel + 1, 1 + idiv(autoClickingLevel, 2))),
  }
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

export function formatNumber(number) {
  if (number < 5000) return String(Math.trunc(number))
  if (number < 5_000_000) return `${(number / 1000).toFixed(1)}K`
  if (number < 5_000_000_000) return `${(number / 1_000_000).toFixed(1)}M`
  return `${(number / 1_000_000_000).toFixed(1)}B`
}
