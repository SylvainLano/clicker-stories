// How a click resolves, shared by the game and the progression simulator (scripts/simulate.mjs),
// so that the simulator always follows the game's real rules.
import { idiv } from './formulas.js'

const MAX_CRITICAL_TIERS = 12

// Critical points: the critical upgrade, plus half the focus, times the critical buffs.
export function criticalPoints(state, multipliers) {
  return Math.trunc((state.critical + idiv(state.focus, 2)) * multipliers.criticalChance)
}

// Chance (%) of each critical tier: single, double, triple... Up to 50 points, they all go to single criticals.
// Beyond, a new tier opens whenever the last one reaches 50%, and each tier grows twice as fast as the one above:
// with two tiers, 1 point for single criticals for 2 for doubles (the double reaches 50% when the single reaches
// 75%); with three, 1 / 2 / 4... So critical points never go to waste, but higher tiers stay rarer.
export function criticalTiers(points) {
  const chances = [Math.min(points, 50)]
  let left = points - 50
  for (let tiers = 2; left > 0 && tiers <= MAX_CRITICAL_TIERS; tiers++) {
    chances.push(0)
    const weights = chances.map((_, tier) => 2 ** tier)
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    // Points needed to bring the newest tier from 0 to 50%.
    const used = Math.min(left, (50 * total) / weights.at(-1))
    chances.forEach((_, tier) => (chances[tier] += (used * weights[tier]) / total))
    left -= used
  }
  return chances
}

// What a click is worth before its rolls. source: 'manual' or 'auto'.
export function clickStats(state, multipliers, source) {
  const stats = {
    bonusIncrease: 0,
    experienceGain: state.power * state.experienceGain,
    coinGain: state.level * state.moneyGain,
    criticalTiers: criticalTiers(criticalPoints(state, multipliers)),
    criticalPower: Math.trunc(state.criticalPower * multipliers.criticalPower),
    standardHit: Math.trunc((105 - state.power * (state.errorNumber + 1) + state.focus * 2) * (multipliers.standardHit / 100)),
    fruitFactor: Math.trunc(state.fruitFactor * multipliers.fruitFactor),
  }
  // Auto-clicks miss less and hit harder with more auto-click levels.
  if (source === 'auto' && stats.standardHit < 100) {
    stats.standardHit = 100 - idiv(100 - stats.standardHit, state.focus)
    stats.bonusIncrease = state.autoClickingLevel * state.level * state.power
    stats.coinGain *= state.autoClickingLevel
    stats.experienceGain *= state.autoClickingLevel
  }
  return stats
}

// Rolls are 0 to 100: one decides if the click misses, the other its critical tier.
// Returns { kind: 'miss' | 'hit' | 'critical', tier } (tier 1 = single critical, 2 = double...).
export function clickOutcome(stats, hitRoll, criticalRoll, criticalAllowed = true) {
  if (hitRoll > stats.standardHit) return { kind: 'miss', tier: 0 }
  if (criticalAllowed) {
    for (let tier = stats.criticalTiers.length; tier >= 1; tier--) {
      if (criticalRoll < stats.criticalTiers[tier - 1]) return { kind: 'critical', tier }
    }
  }
  return { kind: 'hit', tier: 0 }
}

// Score increase, and money and experience before their multipliers. Each critical tier applies the critical
// multiplier once more to the score; money and experience only take it once, whatever the tier (applying tiers
// to them made the game run away: money buys critical points, which bring more tiers, which bring more money).
export function clickGains(state, stats, { kind, tier }) {
  if (kind === 'miss') return { increase: stats.bonusIncrease, coins: 0, experience: 0 }
  if (kind === 'hit') {
    return { increase: stats.bonusIncrease + state.level * state.power, coins: stats.coinGain, experience: stats.experienceGain }
  }
  return {
    increase: state.level * state.power * stats.criticalPower ** tier,
    coins: stats.coinGain * stats.criticalPower,
    experience: stats.experienceGain * stats.criticalPower,
  }
}
