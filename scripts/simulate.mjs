// Progression simulator: a virtual player plays the game's real rules (src/game/), to check the balance.
//
// Usage: npm run simulate -- [options]
//   --cps <n>          manual clicks per second (default 4)
//   --hours <n>        simulated play time (default 6)
//   --strategy <name>  what the player buys: "cheapest" (the cheapest affordable upgrade, default)
//                      or "power" (power and auto-click first, then the cheapest)
//   --skip <list>      upgrades never bought, comma separated (default: fruit,storyBonus — not modelled yet)
//   --seed <n>         random seed, for reproducible runs (default 1)
//
// Not modelled yet: stories and events (timed challenges, chests, quizzes), fruits and their buffs, story bonuses.
// Their rewards come on top of what is shown here.
import { autoClickingDelay, formatNumber, levelForExperience, upgradeCosts, upgradeSteps } from '../src/game/formulas.js'
import { clickGains, clickOutcome, clickStats, criticalPoints, criticalTiers } from '../src/game/rules.js'
import { createState } from '../src/game/state.js'

const STEP = 0.05 // seconds of game time per simulation step
const SHOPPING_INTERVAL = 0.5 // the game refreshes its buttons twice a second
// Upgrade button -> state field, as in src/game/game.js.
const UPGRADES = {
  power: 'power',
  focus: 'focus',
  critical: 'critical',
  criticalPower: 'criticalPower',
  moneyGain: 'moneyGain',
  experienceGain: 'experienceGain',
  fruit: 'fruitFactor',
  storyBonus: 'storyBonus',
  autoClick: 'autoClickingLevel',
}
const NO_BUFFS = { xp: 1, money: 1, criticalChance: 1, criticalPower: 1, standardHit: 100, fruitFactor: 1 }

function parseArgs(argv) {
  const options = { cps: 4, hours: 6, strategy: 'cheapest', skip: ['fruit', 'storyBonus'], seed: 1 }
  for (let i = 0; i < argv.length; i += 2) {
    const [name, value] = [argv[i].replace(/^--/, ''), argv[i + 1]]
    if (!(name in options) || value === undefined) throw new Error(`Unknown or incomplete option: ${argv[i]}`)
    options[name] = name === 'strategy' ? value : name === 'skip' ? value.split(',').filter(Boolean) : Number(value)
  }
  return options
}

// Small seeded random generator (mulberry32): the same seed gives the same run.
function createRandom(seed) {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function click(state, source, random) {
  const stats = clickStats(state, NO_BUFFS, source)
  const outcome = clickOutcome(stats, random() * 100, random() * 100)
  const { increase, coins, experience } = clickGains(state, stats, outcome)
  if (outcome.kind === 'miss') return
  state.score += increase
  state.money += Math.trunc(coins * NO_BUFFS.money)
  state.exp += Math.trunc(experience * NO_BUFFS.xp)
  if (outcome.kind === 'critical') state[source === 'manual' ? 'criticalHits' : 'autoCriticalHits']++
  state[source === 'manual' ? 'clickNumber' : 'autoClickNumber']++
}

// Buys as long as the strategy finds something affordable.
function shop(state, { strategy, skip }) {
  for (;;) {
    const costs = upgradeCosts(state, 1)
    const candidates = Object.keys(UPGRADES)
      .filter((key) => !skip.includes(key))
      .map((key) => ({ key, cost: costs[UPGRADES[key]] }))
      .filter(({ cost }) => cost <= state.money)
      .sort((a, b) => a.cost - b.cost)
    if (!candidates.length) return
    const preferred = strategy === 'power' && candidates.find(({ key }) => key === 'power' || key === 'autoClick')
    const { key, cost } = preferred || candidates[0]
    const field = UPGRADES[key]
    state.money -= cost
    state.moneySpent += cost
    state[field] += upgradeSteps[field](state[field])
    state.upgradesBought[field]++
  }
}

const formatTime = (seconds) => `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`
const short = (number) =>
  number >= 1e9 ? `${(number / 1e9).toFixed(1)}B` : number >= 1e6 ? `${(number / 1e6).toFixed(1)}M` : number >= 1e4 ? `${(number / 1e3).toFixed(1)}K` : String(Math.round(number))

function simulate(options) {
  const random = createRandom(options.seed)
  const state = createState()
  const rows = []
  let manualClock = 0
  let autoClock = 0
  let shoppingClock = 0

  for (let time = 0; time < options.hours * 3600; time += STEP) {
    manualClock += options.cps * STEP
    while (manualClock >= 1) {
      manualClock -= 1
      click(state, 'manual', random)
    }
    if (state.autoClickingLevel >= 1) {
      autoClock += STEP
      const delay = autoClickingDelay(state.autoClickingLevel)
      while (autoClock >= delay) {
        autoClock -= delay
        click(state, 'auto', random)
      }
    }
    shoppingClock += STEP
    if (shoppingClock >= SHOPPING_INTERVAL) {
      shoppingClock = 0
      const level = levelForExperience(state.exp)
      if (level > state.level) {
        for (let reached = state.level + 1; reached <= level; reached++) rows.push({ level: reached, time, state: structuredClone(state) })
        state.level = level
      }
      shop(state, options)
    }
  }
  return { rows, state }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const { rows, state } = simulate(options)
  console.log(
    `${options.hours} h at ${options.cps} clicks/s, strategy "${options.strategy}", never buying: ${options.skip.join(', ') || 'nothing'} (seed ${options.seed})\n`,
  )
  console.table(
    rows.map(({ level, time, state: s }) => ({
      level,
      time: formatTime(time),
      clicks: short(s.clickNumber),
      power: s.power,
      'crit %': criticalTiers(criticalPoints(s, NO_BUFFS)).map(Math.round).join('/'),
      'crit x': s.criticalPower,
      focus: s.focus,
      'money x': s.moneyGain,
      'xp x': s.experienceGain,
      auto: s.autoClickingLevel,
      spent: short(s.moneySpent),
      score: formatNumber(s.score),
    })),
  )
  console.log(`After ${options.hours} h: level ${state.level}, score ${formatNumber(state.score)}, ${short(state.money)} money left, ${short(state.moneySpent)} spent.`)
}

main()
