// Progression simulator: a virtual player plays the game's real rules (src/game/), to check the balance.
//
// Usage: npm run simulate -- [options]
//   --cps <n>          manual clicks per second (default 4)
//   --hours <n>        simulated play time (default 6)
//   --strategy <name>  what the player buys: "cheapest" (the cheapest affordable upgrade, default)
//                      or "power" (power and auto-click first, then the cheapest)
//   --skip <list>      upgrades never bought, comma separated (default: storyBonus — not modelled yet)
//   --catch <n>        share of the fruits the player catches, 0 to 1 (default 0.7)
//   --fruits <n>       only the first n fruits of the game exist (default: all of them; 10 = before version 0.3)
//   --price <list>     first prices to try instead of the game's, e.g. autoFireLevel=50000,focus=20000
//   --level-up <name>  how extended buffs level up: "linear" (the game's) or "compound" (the Java version's)
//   --max-level <n>    highest level of a buff (default: the game's)
//   --fruit-cooldown <n> seconds after a fruit during which no other fruit appears (default: the game's)
//   --seed <n>         random seed, for reproducible runs (default 1)
//
// Not modelled yet: stories and events (timed challenges, chests, quizzes), story bonuses, and the fruits
// whose buffs act on them (lemon, strawberry, cherry, blueberry, pineapple, lime, and the watermelon's extra time).
// Their rewards come on top of what is shown here.
import {
  addBuff,
  buffDiscount,
  buffMultipliers,
  comboFactor,
  expireBuffs,
  FRUIT_BUFF_DURATION,
  FRUIT_BUFFS,
  FRUITS,
  fruitChance,
  LIMITS,
} from '../src/game/buffs.js'
import { autoClickingDelay, autoFireRate, FIRST_PRICES, formatNumber, levelForExperience, upgradeCosts, upgradeSteps } from '../src/game/formulas.js'
import { clickGains, clickOutcome, clickStats, criticalPoints, criticalTiers } from '../src/game/rules.js'
import { createState } from '../src/game/state.js'

const STEP = 0.05 // seconds of game time per simulation step
const REFRESH_INTERVAL = 0.5 // the game refreshes its buttons and buffs twice a second
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
  autoFire: 'autoFireLevel',
}
const NO_STORY_BONUS = () => 0
const TEXT_OPTIONS = ['strategy', 'price', 'level-up']

function parseArgs(argv) {
  const options = {
    cps: 4,
    hours: 6,
    strategy: 'cheapest',
    skip: ['storyBonus'],
    catch: 0.7,
    fruits: FRUITS.length,
    price: '',
    'level-up': LIMITS.levelUp,
    'max-level': LIMITS.maxLevel,
    'fruit-cooldown': LIMITS.fruitCooldown,
    seed: 1,
  }
  for (let i = 0; i < argv.length; i += 2) {
    const [name, value] = [argv[i].replace(/^--/, ''), argv[i + 1]]
    if (!(name in options) || value === undefined) throw new Error(`Unknown or incomplete option: ${argv[i]}`)
    options[name] = TEXT_OPTIONS.includes(name) ? value : name === 'skip' ? value.split(',').filter(Boolean) : Number(value)
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

function createPlayer(options) {
  const fruits = FRUITS.slice(0, options.fruits)
  return {
    options,
    random: createRandom(options.seed),
    state: createState(),
    fruits,
    buffs: [],
    multipliers: buffMultipliers(createState(), [], NO_STORY_BONUS),
    discount: 1,
    now: 0, // simulated milliseconds, as performance.now() in the game
    hitsInARow: 0,
    lastFruit: -Infinity,
    caught: Object.fromEntries(fruits.map((fruit) => [fruit, 0])),
  }
}

const hasBuff = (player, name) => player.buffs.some((entry) => entry.name === name)

// As the game's hit (src/game/game.js).
function click(player, source) {
  const { state, multipliers, random } = player
  const stats = clickStats(state, multipliers, source)
  const outcome = clickOutcome(stats, random() * 100, random() * 100)
  const gains = clickGains(state, stats, outcome)
  player.hitsInARow = outcome.kind === 'miss' ? 0 : player.hitsInARow + 1
  const increase = outcome.kind === 'miss' ? gains.increase : Math.trunc(gains.increase * comboFactor(player.buffs, player.hitsInARow))

  if (outcome.kind !== 'miss') {
    if (outcome.kind === 'critical') state[source === 'auto' ? 'autoCriticalHits' : 'criticalHits']++
    state[source === 'auto' ? 'autoClickNumber' : 'clickNumber']++
  }
  if (outcome.kind !== 'miss' || stats.missShare > 0) {
    state.score += increase
    state.money += Math.trunc(gains.coins * multipliers.money)
    state.exp += Math.trunc(gains.experience * multipliers.xp)
  }

  // A fruit may pop out of any click, hit or miss.
  if (random() < fruitChance(stats.fruitFactor) && player.now - player.lastFruit >= LIMITS.fruitCooldown * 1000) {
    player.lastFruit = player.now
    state.appearedFruits++
    const fruit = player.fruits[Math.floor(random() * Math.min(stats.fruitFactor, player.fruits.length))]
    if (hasBuff(player, 'magnet') || random() < player.options.catch) catchFruit(player, fruit)
  }
}

// As the game's onFruitCaught (without the black chest curse, not modelled).
function catchFruit(player, fruit) {
  const [name, value, duration = FRUIT_BUFF_DURATION] = FRUIT_BUFFS[fruit]
  if (addBuff(player.buffs, { name, value, duration }, player.now)) player.state.extendedBonuses++
  player.state.touchedFruits++
  player.caught[fruit]++
}

// As the game's refreshBuffs: buffs count down, multipliers and prices follow.
function refreshBuffs(player) {
  expireBuffs(player.buffs, player.now)
  player.multipliers = buffMultipliers(player.state, player.buffs, NO_STORY_BONUS)
  player.discount = buffDiscount(player.buffs, NO_STORY_BONUS)
}

// Buys as long as the strategy finds something affordable.
function shop(player) {
  const { state, options } = player
  if (!Number.isFinite(state.money)) throw new Error(`Money is no longer finite at ${formatTime(player.now / 1000)}: ${describeBuffs(player.buffs)}`)
  for (;;) {
    const costs = upgradeCosts(state, player.discount)
    const candidates = Object.keys(UPGRADES)
      .filter((key) => !options.skip.includes(key))
      .map((key) => ({ key, cost: costs[UPGRADES[key]] }))
      .filter(({ cost }) => cost <= state.money)
      .sort((a, b) => a.cost - b.cost)
    if (!candidates.length) return
    const preferred = options.strategy === 'power' && candidates.find(({ key }) => key === 'power' || key === 'autoClick')
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
  Object.assign(LIMITS, { levelUp: options['level-up'], maxLevel: options['max-level'], fruitCooldown: options['fruit-cooldown'] })
  for (const entry of options.price.split(',').filter(Boolean)) {
    const [field, price] = entry.split('=')
    if (!(field in FIRST_PRICES)) throw new Error(`Unknown upgrade in --price: ${field}`)
    FIRST_PRICES[field] = Number(price)
  }
  const player = createPlayer(options)
  const { state } = player
  const rows = []
  let manualClock = 0
  let autoClock = 0
  let refreshClock = 0

  for (let time = 0; time < options.hours * 3600; time += STEP) {
    player.now = time * 1000
    // The player holds the space bar while clicking the mouse, once auto-fire is worth it.
    const fireRate = state.autoFireLevel >= 1 ? autoFireRate(state.autoFireLevel) : 0
    manualClock += (options.cps + fireRate) * STEP
    while (manualClock >= 1) {
      manualClock -= 1
      click(player, 'manual')
    }
    if (state.autoClickingLevel >= 1) {
      autoClock += STEP
      const delay = autoClickingDelay(state.autoClickingLevel)
      while (autoClock >= delay) {
        autoClock -= delay
        click(player, 'auto')
      }
    }
    refreshClock += STEP
    if (refreshClock >= REFRESH_INTERVAL) {
      refreshClock = 0
      refreshBuffs(player)
      const level = levelForExperience(state.exp)
      if (level > state.level) {
        if (level > state.level + 20) throw new Error(`Runaway progression at ${formatTime(time)} (level ${state.level} -> ${level}), buffs: ${describeBuffs(player.buffs)}`)
        for (let reached = state.level + 1; reached <= level; reached++) {
          rows.push({ level: reached, time, state: structuredClone(state), buffs: structuredClone(player.buffs) })
        }
        state.level = level
      }
      shop(player)
    }
  }
  return { rows, player }
}

// Active buffs, with their level when extended past it: "moneyGain x2.4 (L2)".
const describeBuffs = (buffs) =>
  buffs.map(({ name, value, level }) => `${name}${typeof value === 'number' && value !== 1 ? ` ${Number(value.toFixed(1))}` : ''}${level > 1 ? ` L${level}` : ''}`).join(', ')

function main() {
  const options = parseArgs(process.argv.slice(2))
  const { rows, player } = simulate(options)
  const { state } = player
  console.log(
    `${options.hours} h at ${options.cps} clicks/s, strategy "${options.strategy}", never buying: ${options.skip.join(', ') || 'nothing'}, ` +
      `${Math.round(options.catch * 100)}% of fruits caught${options.fruits < FRUITS.length ? `, only ${options.fruits} fruits` : ''}` +
      `${options.price ? `, prices: ${options.price}` : ''} (seed ${options.seed})\n`,
  )
  console.table(
    rows.map(({ level, time, state: s }) => ({
      level,
      time: formatTime(time),
      clicks: short(s.clickNumber),
      power: s.power,
      'crit %': criticalTiers(criticalPoints(s, { criticalChance: 1 })).map(Math.round).join('/'),
      'crit x': s.criticalPower,
      focus: s.focus,
      'money x': s.moneyGain,
      'xp x': s.experienceGain,
      auto: s.autoClickingLevel,
      fire: s.autoFireLevel ? `${autoFireRate(s.autoFireLevel).toFixed(1)}/s` : '-',
      fruits: s.fruitFactor,
      caught: short(s.touchedFruits),
      spent: short(s.moneySpent),
      score: formatNumber(s.score),
    })),
  )
  console.log(`After ${options.hours} h: level ${state.level}, score ${formatNumber(state.score)}, ${short(state.money)} money left, ${short(state.moneySpent)} spent.`)
  console.log(`Fruits: ${short(state.appearedFruits)} appeared, ${short(state.touchedFruits)} caught, ${state.extendedBonuses} buff level-ups.`)
  console.log(`Caught: ${Object.entries(player.caught).map(([fruit, count]) => `${fruit} ${count}`).join(', ')}`)
  console.log(`Active buffs at the end: ${describeBuffs(player.buffs) || 'none'}`)
}

main()
