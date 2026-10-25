import { assetUrl, pickRandom } from '../assets.js'
import { shake } from '../ui/effects.js'
import { showToast } from '../ui/toast.js'
import {
  autoClickingDelay,
  autoFireRate,
  experienceForLevel,
  formatNumber,
  levelForExperience,
  STARTING_VALUES,
  upgradeCosts,
  upgradeSteps,
} from './formulas.js'
import { addBuff, buffDiscount, buffMultipliers, expireBuffs, buffValue, comboFactor, FRUIT_BUFF_DURATION, FRUIT_BUFFS, FRUITS, fruitChance, LIMITS, pickFruit, SEEDS_EXTRA_TIME } from './buffs.js'
import { clickGains, clickOutcome, clickStats, criticalPoints, criticalTiers } from './rules.js'
import { saveState } from './state.js'

const SOUNDS = {
  upgrade: '/sound/effects/Retro Event StereoUP 02.wav',
  miss: '/sound/effects/miss.wav',
  fruit: '/sound/effects/Confirm.wav',
  firework: '/sound/effects/Firework Explosion.mp3',
}

const REFRESH_INTERVAL = 0.5 // seconds between two refreshes of buttons, buffs and achievements
const MAX_TEXT_CLICKS = 8 // clicks per second that advance the story text, at most (auto-fire goes far beyond)
const MAX_CLICK_PARTICLES = 5 // above this many clicks per second, clicks stop throwing particles

// Achievement id -> unlock condition (one quizz per story bonus: all of them answered when as many as the bonuses).
const ACHIEVEMENT_CONDITIONS = {
  adventure_begins: (state) => state.startedStoryIds.size > 0 || state.finishedStoryIds.size > 0,
  reach_your_goal: (state) => state.finishedStoryIds.size > 0,
  traveler: (state) => state.finishedStoryIds.size >= 5,
  to_my_liking: (state) => state.level >= 3,
  got_a_penchant: (state) => state.level >= 6,
  soft_spot_hit: (state) => state.level >= 9,
  little_craving: (state) => state.level >= 12,
  got_appetite: (state) => state.level >= 15,
  hungry: (state) => state.level >= 18,
  starving: (state) => state.level >= 21,
  ravenous: (state) => state.level >= 24,
  insatiable: (state) => state.level >= 27,
  big_eater: (state) => state.level >= 30,
  glutton: (state) => state.level >= 33,
  bottomless_pit: (state) => state.level >= 36,
  devourer: (state) => state.level >= 39,
  food_coma: (state) => state.level >= 42,
  feast_master: (state) => state.level >= 45,
  eats_the_world: (state) => state.level >= 48,
  greedy: (state) =>
    state.moneyGain > 10 &&
    ['power', 'critical', 'criticalPower', 'experienceGain', 'autoClickingLevel', 'fruitFactor', 'focus'].every(
      (key) => state.moneyGain > state[key],
    ),
  first_fruit: (state) => state.touchedFruits >= 1,
  some_fruits: (state) => state.touchedFruits >= 50,
  plenty_of_fruits: (state) => state.touchedFruits >= 500,
  too_much_fruits: (state) => state.touchedFruits >= 5000,
  all_fruits: (state) => FRUITS.every((fruit) => state.caughtFruitKinds.has(fruit)),
  first_story_bonus: (state) => state.storyBonus >= 1,
  five_story_bonus: (state) => state.storyBonus >= 5,
  gold_coin: (state) => state.moneySpent >= 1e9,
  bronze_ring: (state) => state.criticalHits + state.autoCriticalHits >= 100,
  silver_ring: (state) => state.criticalHits + state.autoCriticalHits >= 1000,
  gold_ring: (state) => state.criticalHits + state.autoCriticalHits >= 10000,
  green_ring: (state) => state.highestCriticalTier >= 2,
  special_ring: (state) => state.highestCriticalTier >= 3,
  star_bronze: (state) => state.eventsWon >= 1,
  star_silver: (state) => state.eventsWon >= 10,
  star_gold: (state) => state.eventsWon >= 50,
  star_special: (state) => state.eventsWon >= 200,
  small_letter: (state) => state.goodAnswers >= 1,
  nice_letter: (state) => state.goodAnswers >= 25,
  love_letter: (state, { storyBonuses }) => state.finishedQuizzIds.size >= storyBonuses.length,
  small_egg: (state) => state.clickNumber >= 10000,
  big_egg: (state) => state.clickNumber >= 1000000,
  candy: (state) => state.maxClicksSecond >= 10,
  marbles: (state) => state.emptyChests >= 10,
  only_luck: (state) => state.goldChests >= 1,
  the_eye: (state) => state.cursesLifted >= 1,
}

// Until the story engine is attached (setStory): no story, nothing to animate.
const NO_STORY = {
  maxDigits: 20,
  animate() {},
  beforeHit: (roll) => roll,
  afterHit() {},
  allowsCritical: () => true,
  extendTimedChallenge() {},
  update() {},
}

// Until main.js gives the tips: none.
const NO_TIPS = { offer() {}, done() {}, update() {}, reset() {} }

export function createGame({ stage, state, hud, effects, sounds, music, hooks, t, colors, achievements, storyBonuses, tips = NO_TIPS }) {
  let story = NO_STORY
  // Multipliers recomputed on every refresh from the error count, temporary buffs and story bonuses.
  const multipliers = { xp: 1, money: 1, criticalChance: 1, criticalPower: 1, standardHit: 100, fruitFactor: 1 }
  const activeBuffs = []
  let clickTimes = []
  let accentColor = colors[0]
  let costs = {}
  let autoClickTimer = null
  let refreshTime = 0
  let manualClickTimes = []
  let textClickTimes = []
  let spaceHeld = false
  let fireClock = 0
  let lastFruitTime = -Infinity
  let hitsInARow = 0
  let gunshots = []

  // ---------- Helpers ----------

  // Active story bonuses of a kind; they count twice (or more, once leveled up) while a pineapple is active.
  const activeStoryBonuses = (bonus) =>
    Math.trunc(
      storyBonuses.filter((entry) => entry.bonus === bonus && entry.activated).length * (buffValue(activeBuffs, 'storyBonusBoost') ?? 1),
    )
  const buff = (name) => activeBuffs.find((entry) => entry.name === name)

  function buttonCenter() {
    const stageBox = stage.getBoundingClientRect()
    const box = hud.mainButton.getBoundingClientRect()
    return { x: box.left - stageBox.left + box.width / 2, y: box.top - stageBox.top + box.height / 2 }
  }

  function addMoney(amount) {
    const gain = Math.trunc(amount * multipliers.money)
    state.money += gain
    return gain
  }

  function addExperience(amount) {
    const gain = Math.trunc(amount * multipliers.xp)
    state.exp += gain
    return gain
  }

  function digit(x, y, text, kind) {
    effects.addDigit(x, y, text, kind, { maxDigits: story.maxDigits })
    if (countRecentClicks() < MAX_CLICK_PARTICLES) {
      for (let i = 0; i < 3; i++) effects.addParticle(x, y, accentColor)
    }
  }

  // Clicks of the player (mouse, space bar and auto-fire) in the last second.
  function countRecentClicks() {
    clickTimes = lastSecond(clickTimes)
    return clickTimes.length
  }

  function lastSecond(times) {
    const oneSecondAgo = performance.now() - 1000
    return times.filter((time) => time >= oneSecondAgo)
  }

  // A click of the player: it advances the story text, up to MAX_TEXT_CLICKS per second. Only real clicks
  // (not auto-fire) count for the clicks per second record.
  function playerClick(source) {
    const now = performance.now()
    state.clickNumber++
    tips.done('start')
    clickTimes.push(now)
    textClickTimes = lastSecond(textClickTimes)
    if (textClickTimes.length < MAX_TEXT_CLICKS) {
      textClickTimes.push(now)
      story.animate()
    }
    if (source === 'manual') {
      manualClickTimes = lastSecond(manualClickTimes)
      state.maxClicksSecond = Math.max(state.maxClicksSecond, manualClickTimes.length)
      manualClickTimes.push(now)
    }
  }

  // ---------- Labels ----------

  function updateLabels() {
    hud.labels.score.textContent = t('labels', 'score') + formatNumber(state.score)
    hud.labels.money.textContent = t('labels', 'money') + formatNumber(state.money)
    hud.labels.level.textContent = t('labels', 'level') + state.level
    const current = experienceForLevel(state.level)
    hud.setProgress((state.exp - current) / (experienceForLevel(state.level + 1) - current))
  }

  function setAccentColor() {
    accentColor = colors[(state.level - 1) % colors.length]
    hud.setAccentColor(accentColor)
  }

  // ---------- Cursor ----------

  // The cursor changes with the level, unless the current story or event sets its own.
  let customCursor = null
  function refreshCursor() {
    const path = customCursor?.normal || `/images/cursors/cursor_level_${((state.level - 1) % 14) + 1}.png`
    document.body.style.cursor = `url("${assetUrl(path)}"), auto`
    hud.mainButton.style.cursor = customCursor?.hover ? `url("${assetUrl(customCursor.hover)}"), auto` : ''
  }

  // ---------- Clicks ----------

  // source: 'manual' (mouse or space bar), 'fire' (space bar held, auto-fire) or 'auto' (auto-click).
  // Auto-fire clicks are the player's clicks; auto-clicks are not, and never advance the story text.
  // (x, y): where the numbers fly from.
  function hit(source, x, y) {
    const stats = clickStats(state, multipliers, source)
    const hitRoll = story.beforeHit(Math.random() * 100, source)
    const outcome = clickOutcome(stats, hitRoll, Math.random() * 100, story.allowsCritical())
    const gains = clickGains(state, stats, outcome)
    // Kiwi: hits in a row raise the score of the next ones.
    hitsInARow = outcome.kind === 'miss' ? 0 : hitsInARow + 1
    const increase = outcome.kind === 'miss' ? gains.increase : Math.trunc(gains.increase * comboFactor(activeBuffs, hitsInARow))
    const byPlayer = source !== 'auto'
    let kind

    if (outcome.kind === 'miss') {
      kind = 'miss'
      if (byPlayer) tips.offer('miss', hud.mainButton)
      sounds.play(SOUNDS.miss, 0.5)
    } else if (outcome.kind === 'hit') {
      if (byPlayer) {
        kind = 'score-digit'
        playerClick(source)
      } else {
        kind = 'artificial-digit'
        state.autoClickNumber++
      }
    } else {
      state.highestCriticalTier = Math.max(state.highestCriticalTier, outcome.tier)
      if (byPlayer) {
        kind = 'critical-digit'
        state.criticalHits++
        playerClick(source)
        // The gunshot and the shake fade away once critical hits become common.
        const volume = Math.max(10 - state.critical, 0)
        if (volume !== 0) {
          shake(stage)
          if (gunshots.length) sounds.play(pickRandom(gunshots), volume)
        }
      } else {
        kind = 'autocritical-digit'
        state.autoClickNumber++
        state.autoCriticalHits++
      }
    }
    // Misses only bring something with seeds (watermelon).
    if (outcome.kind !== 'miss' || stats.missShare > 0) {
      state.score += increase
      addMoney(gains.coins)
      addExperience(gains.experience)
    }

    updateLabels()
    digit(x, y, increase === 0 ? 'x' : formatNumber(increase), kind)
    story.afterHit({ kind, increase })

    // Second roll: something may pop out of a hit.
    const bonusRoll = Math.random() * 100
    const handled = kind === 'critical-digit' && hooks.emit('criticalHit', { roll: bonusRoll, x, y, state, effects })
    const fruitReady = performance.now() - lastFruitTime >= LIMITS.fruitCooldown * 1000
    if (!handled && fruitReady && bonusRoll < fruitChance(stats.fruitFactor) * 100) {
      lastFruitTime = performance.now()
      effects.addFruit(x, y, pickFruit(stats.fruitFactor, Math.random()))
      state.appearedFruits++
    }
  }

  function clickAtButtonCenter(source) {
    const { x, y } = buttonCenter()
    hit(source, x, y)
  }

  // ---------- Buffs ----------

  function activateBuff(name, description, value, duration) {
    duration *= Math.pow(1.25, activeStoryBonuses('moretime'))
    if (addBuff(activeBuffs, { name, description, value, duration }, performance.now())) state.extendedBonuses++
  }

  function onFruitCaught(fruit, { x, y }) {
    for (let i = 0; i < 20; i++) effects.addParticle(x, y, accentColor)
    const [name, value, duration = FRUIT_BUFF_DURATION] = FRUIT_BUFFS[fruit]
    // Counted here: the Java version counted every buff as a caught fruit, the black chest curse included.
    state.touchedFruits++
    state.caughtFruitKinds.add(fruit)
    tips.done('fruit')
    // A coconut lifts the black chest curse first, if there is one.
    const curse = activeBuffs.findIndex((entry) => entry.name === 'CURSED')
    if (fruit === 'coconut' && curse >= 0) {
      activeBuffs.splice(curse, 1)
      state.cursesLifted++
      refreshBuffs()
      updateButtons()
    } else {
      activateBuff(name, t('buffs', name), value, duration)
      if (fruit === 'watermelon') story.extendTimedChallenge(SEEDS_EXTRA_TIME)
    }
    sounds.play(SOUNDS.fruit, 0.5)
  }

  function buffText({ name, description, value, duration }) {
    const seconds = Math.round(duration)
    if (['expGain', 'moneyGain', 'criticalBoth', 'fruitFactor', 'storyBonusBoost', 'eventReward', 'combo'].includes(name)) {
      return `${description}${value.toFixed(1)} : ${seconds}`
    }
    if (name === 'discount') return `${description} ${value.toFixed(1)}% : ${seconds}`
    if (name === 'criticalBonus') return `${description} +${Math.round(value)} : ${seconds}`
    if (name === 'seeds') return `${description} ${Math.round(Math.min(value, 1) * 100)}% : ${seconds}`
    return `${description} : ${seconds}`
  }

  // Recomputes the multipliers and counts the buffs down.
  function refreshBuffs() {
    expireBuffs(activeBuffs, performance.now())
    Object.assign(multipliers, buffMultipliers(state, activeBuffs, activeStoryBonuses))

    hud.buffs.replaceChildren()
    for (const entry of activeBuffs) {
      const line = document.createElement('div')
      line.textContent = buffText(entry)
      // Buffs extended past their first level take the color of the previous level.
      if (entry.level > 1) line.style.color = colors[(state.level - 2 + colors.length) % colors.length]
      hud.buffs.append(line)
    }
  }

  const discount = () => buffDiscount(activeBuffs, activeStoryBonuses)

  // ---------- Upgrades ----------

  // Button key -> state field.
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

  function buy(key) {
    const field = UPGRADES[key]
    const cost = costs[field]
    if (state.money < cost) return
    state.money -= cost
    state.moneySpent += cost
    state[field] += upgradeSteps[field](state[field])
    state.upgradesBought[field]++
    tips.done('upgrade')
    if (key === 'storyBonus') tips.done('storyBonus')
    updateLabels()
    updateButtons()
    if (key === 'autoClick') restartAutoClick()
    if (key === 'storyBonus') hud.menuButtons.storyBonus.show()
    sounds.play(SOUNDS.upgrade, 0.5)
  }

  function upgradeTexts(key) {
    const cost = t('buttons', 'cost') + formatNumber(costs[UPGRADES[key]])
    const value = state[UPGRADES[key]]
    switch (key) {
      case 'power':
        return [`${t('caracteristics', 'power')} ${value}`, cost]
      case 'focus':
        return [`${t('caracteristics', 'focus')} ${value}`, cost]
      case 'critical':
        // Single critical chance, then double, triple... once past 50%.
        return [
          value === 0
            ? t('buttons', 'unlockCritical')
            : `${t('caracteristics', 'critical')} ${criticalTiers(criticalPoints(state, multipliers)).map(Math.round).join('/')} %`,
          cost,
        ]
      case 'criticalPower':
        return [`${t('caracteristics', 'critical')} x ${value}`, cost]
      case 'moneyGain':
        return [`${t('caracteristics', 'moneyGain')} x ${value}`, cost]
      case 'experienceGain':
        return [`${t('caracteristics', 'expGain')} x ${value}`, cost]
      case 'fruit':
        return [value === 0 ? t('buttons', 'unlockFruit') : `${t('caracteristics', 'fruits')} x ${Math.trunc(value * multipliers.fruitFactor)}`, cost]
      case 'storyBonus':
        return [value === 0 ? t('buttons', 'unlockStoryBonus') : `${value} ${t('caracteristics', 'storyBonus')}`, cost]
      case 'autoClick':
        return [value === 0 ? t('buttons', 'unlockAutoclick') : t('buttons', 'autoDelay') + Number(autoClickingDelay(value).toFixed(2)), cost]
      case 'autoFire':
        return [value === 0 ? t('buttons', 'unlockAutoFire') : `${t('buttons', 'autoFire')} ${autoFireRate(value)}/s`, cost]
    }
  }

  function updateButtons() {
    costs = upgradeCosts(state, discount())
    for (const [key, field] of Object.entries(UPGRADES)) {
      const button = hud.upgrades[key]
      // Story bonuses can only be bought once a story's quizzes are all answered.
      const affordable = state.money >= costs[field] && (key !== 'storyBonus' || state.finishedQuizzIds.size > state.storyBonus)
      if (affordable) {
        button.show()
        button.setDisabled(false)
      } else if (state[field] > STARTING_VALUES[field]) {
        // Already bought at least once: shown even when not affordable.
        button.show()
        button.setDisabled(true)
      } else {
        button.hide()
      }
      button.setText(...upgradeTexts(key))
    }
  }

  // ---------- Auto-click ----------

  function restartAutoClick() {
    clearInterval(autoClickTimer)
    if (state.autoClickingLevel >= 1) {
      autoClickTimer = setInterval(() => clickAtButtonCenter('auto'), autoClickingDelay(state.autoClickingLevel) * 1000)
    }
  }

  function stopAutoClick() {
    clearInterval(autoClickTimer)
  }

  // ---------- Levels ----------

  function firework(explosions) {
    for (let i = 0; i < explosions; i++) {
      setTimeout(() => {
        sounds.play(SOUNDS.firework, 0.6, 0, 0.5)
        const x = 400 + (Math.random() - 0.5) * 400
        const y = 300 + (Math.random() - 0.5) * 300
        for (let j = 0; j < 30; j++) effects.addParticle(x, y, accentColor)
      }, i * 1000)
    }
  }

  function checkLevelUp() {
    const level = levelForExperience(state.exp)
    if (!(level > state.level)) return
    state.level = level
    setAccentColor()
    updateLabels()
    refreshCursor()
    firework(level)
    save()
    const { x, y } = buttonCenter()
    for (const text of ['UP', 'UP', level, level, level, level]) digit(x, y, String(text), 'levelup-digit')
  }

  // ---------- Achievements ----------

  function checkAchievements() {
    for (const achievement of achievements) {
      if (state.unlockedAchievementIds.has(achievement.id)) continue
      if (!ACHIEVEMENT_CONDITIONS[achievement.id]?.(state, { storyBonuses })) continue
      state.unlockedAchievementIds.add(achievement.id)
      showToast(stage, { title: achievement.name, description: achievement.description, image: achievement.image })
      hud.menuButtons.achievements.show()
    }
  }

  // ---------- Tutorial tips ----------

  // Tips shown when their mechanic shows up (the others are offered where they happen: misses, timed challenges...).
  function checkTips() {
    const usable = (button) => button.element.style.visibility !== 'hidden' && !button.element.disabled
    const shown = (button) => button.element.style.visibility !== 'hidden'
    if (state.clickNumber === 0) tips.offer('start', hud.mainButton)
    const affordable = Object.keys(UPGRADES).find((key) => usable(hud.upgrades[key]))
    if (affordable) tips.offer('upgrade', hud.upgrades[affordable].element)
    if (state.autoClickingLevel >= 1) tips.offer('autoClick', hud.upgrades.autoClick.element)
    if (usable(hud.upgrades.autoFire) || state.autoFireLevel >= 1) tips.offer('autoFire', hud.upgrades.autoFire.element)
    if (effects.firstFruit) tips.offer('fruit', () => effects.firstFruit)
    if (activeBuffs.length > 0) tips.offer('buffs', hud.buffs)
    if (criticalTiers(criticalPoints(state, multipliers)).length > 1) tips.offer('criticalTiers', hud.upgrades.critical.element)
    if (shown(hud.menuButtons.stories)) tips.offer('stories', hud.menuButtons.stories.element)
    if (shown(hud.menuButtons.achievements)) tips.offer('achievements', hud.menuButtons.achievements.element)
    if (usable(hud.upgrades.storyBonus)) tips.offer('storyBonus', hud.upgrades.storyBonus.element)
  }

  // ---------- Saving ----------

  function save() {
    // Leaving while cursed costs a level of everything, and all your money.
    if (buff('CURSED')) {
      state.money = 0
      for (const [field, minimum] of Object.entries(STARTING_VALUES)) {
        state[field] = Math.max(state[field] - 1, field === 'criticalPower' ? 1 : minimum)
      }
    }
    if (saveState(state)) hud.showSaveStatus(t('statusLabel', 'saved'))
  }

  // ---------- Main loop ----------

  let lastFrame = null
  function frame(now) {
    // Real elapsed time, even after a pause in a background tab: buff timers count real seconds.
    const dt = lastFrame === null ? 0 : (now - lastFrame) / 1000
    lastFrame = now

    refreshTime += dt
    if (refreshTime > REFRESH_INTERVAL) {
      checkLevelUp()
      updateButtons()
      checkAchievements()
      refreshBuffs()
      checkTips()
      refreshTime = 0
    }
    // Play time only counts while numbers are flying, i.e. while actually playing.
    autoFire(dt)
    if (effects.hasDigits) state.inGameTime += dt
    effects.update(dt)
    tips.update()
    story.update(dt)
    requestAnimationFrame(frame)
  }

  // ---------- Input ----------

  // Pressing the space bar clicks once; holding it keeps clicking at the auto-fire rate (see frame).
  function onKeyDown(event) {
    if (event.key === ' ') {
      event.preventDefault() // no page scroll, no click on the focused button
      if (event.repeat || spaceHeld) return
      spaceHeld = true
      fireClock = 0
      hud.mainButton.classList.add('pressed')
      clickAtButtonCenter('manual')
    }
    hooks.emit('keydown', event.key)
  }

  function releaseSpace() {
    spaceHeld = false
    hud.mainButton.classList.remove('pressed')
  }

  function onKeyUp(event) {
    if (event.key === ' ') releaseSpace()
  }

  function autoFire(dt) {
    if (!spaceHeld) return
    const interval = 1 / autoFireRate(state.autoFireLevel)
    // After a long frame, at most half a second of shots at once.
    fireClock = Math.min(fireClock + dt, Math.max(interval, 0.5))
    while (fireClock >= interval) {
      fireClock -= interval
      if (state.autoFireLevel >= 1) tips.done('autoFire')
      clickAtButtonCenter('fire')
    }
  }

  let buttonSkin = ''

  return {
    state,
    hud,
    effects,
    sounds,
    music,
    stage,
    storyBonuses,
    multipliers,
    get buffs() {
      return activeBuffs
    },
    activeStoryBonuses,
    tips,
    hasBuff: (name) => Boolean(buff(name)),
    buffValue: (name) => buffValue(activeBuffs, name),
    buy,
    activateBuff,
    onFruitCaught,
    addMoney,
    addExperience,
    checkLevelUp,
    buttonCenter,
    digit,
    stopAutoClick,
    restartAutoClick,
    save,
    updateLabels,
    updateButtons,
    setStory(engine) {
      story = engine
    },
    setCustomCursor(cursor) {
      customCursor = cursor
      refreshCursor()
    },
    // Skin of the main button, chosen by the current story or event (a CSS class, '' for the default one).
    setButtonSkin(skin) {
      if (buttonSkin) hud.mainButton.classList.remove(buttonSkin)
      buttonSkin = skin ?? ''
      if (buttonSkin) hud.mainButton.classList.add(buttonSkin)
    },
    setCredits(text) {
      hud.setCredits(hooks.transform('creditsText', text))
    },

    // Mouse click on the main button: numbers fly from where it was clicked.
    onMainButtonClick(event) {
      if (event.detail === 0) return // keyboard activation, handled by onKeyDown
      const box = stage.getBoundingClientRect()
      hit('manual', event.clientX - box.left, event.clientY - box.top)
    },

    start({ gunshotSounds }) {
      gunshots = gunshotSounds
      setAccentColor()
      refreshCursor()
      refreshBuffs()
      updateLabels()
      updateButtons()
      restartAutoClick()
      if (state.unlockedAchievementIds.size > 0) hud.menuButtons.achievements.show()
      if (state.storyBonus > 0) hud.menuButtons.storyBonus.show()
      addEventListener('keydown', onKeyDown)
      addEventListener('keyup', onKeyUp)
      // A key released while the window had lost the focus would keep auto-fire running.
      addEventListener('blur', releaseSpace)
      // Saves when the page is closed or hidden (closing the window saved in the Java version).
      addEventListener('pagehide', save)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save())
      requestAnimationFrame(frame)
    },
  }
}
