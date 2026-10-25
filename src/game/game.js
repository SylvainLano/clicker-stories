import { assetUrl, pickRandom } from '../assets.js'
import { shake } from '../ui/effects.js'
import { showToast } from '../ui/toast.js'
import {
  autoClickingDelay,
  experienceForLevel,
  formatNumber,
  idiv,
  levelForExperience,
  upgradeCosts,
  upgradeSteps,
} from './formulas.js'
import { saveState } from './state.js'

const SOUNDS = {
  upgrade: '/sound/effects/Retro Event StereoUP 02.wav',
  miss: '/sound/effects/miss.wav',
  fruit: '/sound/effects/Confirm.wav',
  firework: '/sound/effects/Firework Explosion.mp3',
}

// In the order of their odds: with N fruit levels, only the first N (at most 10) can appear.
const FRUITS = ['apple', 'orange', 'banana', 'lemon', 'strawberry', 'cherry', 'peach', 'grape', 'pear', 'blueberry']
// Fruit -> temporary buff it grants for a minute: [buff, multiplier].
const FRUIT_BUFFS = {
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
}
const FRUIT_BUFF_DURATION = 60
// Buffs extended past this many seconds level up: stronger, but their timer is cut back.
const BUFF_LEVEL_UP_THRESHOLD = 300
const BUFF_LEVEL_UP_CUT = 240

const REFRESH_INTERVAL = 0.5 // seconds between two refreshes of buttons, buffs and achievements
const SPACE_REPEAT_DELAY = 2000 // holding space clicks once every 2 seconds
const MAX_CLICK_PARTICLES = 5 // above this many clicks per second, clicks stop throwing particles

// Achievement id -> unlock condition.
const ACHIEVEMENT_CONDITIONS = {
  adventure_begins: (state) => state.startedStoryIds.size > 0 || state.finishedStoryIds.size > 0,
  reach_your_goal: (state) => state.finishedStoryIds.size > 0,
  traveler: (state) => state.finishedStoryIds.size >= 5,
  to_my_liking: (state) => state.level >= 3,
  got_a_penchant: (state) => state.level >= 6,
  soft_spot_hit: (state) => state.level >= 9,
  little_craving: (state) => state.level >= 12,
  got_appetite: (state) => state.level >= 15,
  greedy: (state) =>
    state.moneyGain > 10 &&
    ['power', 'critical', 'criticalPower', 'experienceGain', 'autoClickingLevel', 'fruitFactor', 'focus'].every(
      (key) => state.moneyGain > state[key],
    ),
}

// Until the story engine is attached (setStory): no story, nothing to animate.
const NO_STORY = {
  maxDigits: 20,
  animate() {},
  beforeHit: (roll) => roll,
  afterHit() {},
  allowsCritical: () => true,
  update() {},
}

export function createGame({ stage, state, hud, effects, sounds, music, hooks, t, colors, achievements, storyBonuses }) {
  let story = NO_STORY
  // Multipliers recomputed on every refresh from the error count, temporary buffs and story bonuses.
  const multipliers = { xp: 1, money: 1, criticalChance: 1, criticalPower: 1, standardHit: 100, fruitFactor: 1 }
  const activeBuffs = []
  let clickTimes = []
  let accentColor = colors[0]
  let costs = {}
  let autoClickTimer = null
  let refreshTime = 0
  let lastSpacePress = 0
  let gunshots = []

  // ---------- Helpers ----------

  const activeStoryBonuses = (bonus) => storyBonuses.filter((entry) => entry.bonus === bonus && entry.activated).length
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

  function countRecentClicks() {
    const oneSecondAgo = performance.now() - 1000
    clickTimes = clickTimes.filter((time) => time >= oneSecondAgo)
    return clickTimes.length
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

  // source: 'manual' (mouse or space bar) or 'auto' (auto-click); (x, y): where the numbers fly from.
  function hit(source, x, y) {
    let increase = 0
    let experienceGain = state.power * state.experienceGain
    let coinGain = state.level * state.moneyGain
    const criticalChance = Math.trunc((state.critical + idiv(state.focus, 2)) * multipliers.criticalChance)
    const criticalPower = Math.trunc(state.criticalPower * multipliers.criticalPower)
    let standardHit = Math.trunc((105 - state.power * (state.errorNumber + 1) + state.focus * 2) * (multipliers.standardHit / 100))
    const fruitFactor = Math.trunc(state.fruitFactor * multipliers.fruitFactor)

    // Auto-clicks miss less and hit harder with more auto-click levels.
    if (source === 'auto' && standardHit < 100) {
      standardHit = 100 - idiv(100 - standardHit, state.focus)
      increase += state.autoClickingLevel * state.level * state.power
      coinGain *= state.autoClickingLevel
      experienceGain *= state.autoClickingLevel
    }

    const roll = story.beforeHit(Math.random() * 100, source)
    const recentClicks = countRecentClicks()
    let kind

    if (roll > standardHit) {
      kind = 'miss'
      sounds.play(SOUNDS.miss, 0.5)
    } else if (roll > criticalChance || !story.allowsCritical()) {
      if (source === 'manual') {
        kind = 'score-digit'
        state.clickNumber++
        story.animate()
        clickTimes.push(performance.now())
        state.maxClicksSecond = Math.max(state.maxClicksSecond, recentClicks)
      } else {
        kind = 'artificial-digit'
        state.autoClickNumber++
      }
      increase += state.level * state.power
      state.score += increase
      addMoney(coinGain)
      addExperience(experienceGain)
    } else {
      if (source === 'manual') {
        kind = 'critical-digit'
        state.clickNumber++
        state.criticalHits++
        story.animate()
        clickTimes.push(performance.now())
        state.maxClicksSecond = Math.max(state.maxClicksSecond, recentClicks)
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
      increase = state.level * state.power * criticalPower
      state.score += increase
      addMoney(coinGain * criticalPower)
      addExperience(experienceGain * criticalPower)
    }

    updateLabels()
    digit(x, y, increase === 0 ? 'x' : formatNumber(increase), kind)
    story.afterHit({ kind, increase })

    // Second roll: something may pop out of a hit.
    const bonusRoll = Math.random() * 100
    const handled = kind === 'critical-digit' && hooks.emit('criticalHit', { roll: bonusRoll, x, y, state, effects })
    if (!handled && fruitFactor > bonusRoll * 10) {
      effects.addFruit(x, y, FRUITS[Math.floor(Math.random() * Math.min(fruitFactor, FRUITS.length))])
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
    const existing = buff(name)
    if (existing) {
      countDown(existing)
      existing.duration += duration
      if (existing.duration > BUFF_LEVEL_UP_THRESHOLD) {
        existing.duration -= BUFF_LEVEL_UP_CUT
        existing.value *= 1.2
        existing.level++
        state.extendedBonuses++
      }
    } else {
      activeBuffs.push({ name, description, value, duration, level: 1, countedAt: performance.now() })
    }
    state.touchedFruits++
  }

  // Buffs count down in real time, from the moment they were obtained.
  function countDown(entry) {
    const now = performance.now()
    entry.duration -= (now - entry.countedAt) / 1000
    entry.countedAt = now
  }

  function onFruitCaught(fruit, { x, y }) {
    for (let i = 0; i < 20; i++) effects.addParticle(x, y, accentColor)
    const [name, value] = FRUIT_BUFFS[fruit]
    activateBuff(name, t('buffs', name), value, FRUIT_BUFF_DURATION)
    sounds.play(SOUNDS.fruit, 0.5)
  }

  function buffText({ name, description, value, duration }) {
    const seconds = Math.round(duration)
    if (['expGain', 'moneyGain', 'criticalBoth', 'fruitFactor'].includes(name)) return `${description}${value.toFixed(1)} : ${seconds}`
    if (name === 'discount') return `${description} ${value.toFixed(1)}% : ${seconds}`
    return `${description} : ${seconds}`
  }

  // Recomputes the multipliers and counts the buffs down.
  function refreshBuffs() {
    const penalty = 1 / (state.errorNumber + 1)
    Object.assign(multipliers, {
      xp: penalty * Math.pow(2, activeStoryBonuses('xpboost')),
      money: penalty,
      criticalChance: penalty,
      criticalPower: penalty,
      standardHit: 100,
      fruitFactor: penalty,
    })

    hud.buffs.replaceChildren()
    for (let i = activeBuffs.length - 1; i >= 0; i--) {
      const entry = activeBuffs[i]
      countDown(entry)
      if (entry.duration < 0) activeBuffs.splice(i, 1)
    }
    for (const entry of activeBuffs) {
      if (entry.name === 'expGain') multipliers.xp *= entry.value
      else if (entry.name === 'moneyGain') multipliers.money *= entry.value
      else if (entry.name === 'criticalBoth') {
        multipliers.criticalChance *= entry.value
        multipliers.criticalPower *= entry.value
      } else if (entry.name === 'CURSED') multipliers.standardHit -= state.power + state.errorNumber + 20
      else if (entry.name === 'fullFocus') multipliers.standardHit = 500 / (state.errorNumber + 1)
      else if (entry.name === 'fruitFactor') multipliers.fruitFactor *= entry.value

      const line = document.createElement('div')
      line.textContent = buffText(entry)
      // Buffs extended past their first level take the color of the previous level.
      if (entry.level > 1) line.style.color = colors[(state.level - 2 + colors.length) % colors.length]
      hud.buffs.append(line)
    }
  }

  // 1 = full price. Grapes and story bonuses lower prices, a curse raises them.
  function discount() {
    let percent = 100 - 10 * activeStoryBonuses('discount10')
    for (const entry of activeBuffs) {
      if (entry.name === 'discount') percent -= entry.value
      else if (entry.name === 'CURSED') percent += entry.value * 10
    }
    return percent / 100
  }

  // ---------- Upgrades ----------

  // Button key -> [state field, cost key, unlock text key].
  const UPGRADES = {
    power: ['power', 'power'],
    focus: ['focus', 'focus'],
    critical: ['critical', 'critical', 'unlockCritical'],
    criticalPower: ['criticalPower', 'criticalPower'],
    moneyGain: ['moneyGain', 'moneyGain'],
    experienceGain: ['experienceGain', 'experienceGain'],
    fruit: ['fruitFactor', 'fruitFactor', 'unlockFruit'],
    storyBonus: ['storyBonus', 'storyBonus', 'unlockStoryBonus'],
    autoClick: ['autoClickingLevel', 'autoClicking', 'unlockAutoclick'],
  }

  // Which upgrades show even when you can't afford them: those already bought at least once.
  const STARTING_VALUES = { power: 1, focus: 1, critical: 0, criticalPower: 2, moneyGain: 1, experienceGain: 1, fruitFactor: 0, storyBonus: 0, autoClickingLevel: 0 }

  function buy(key) {
    const [field, costKey] = UPGRADES[key]
    const cost = costs[costKey]
    if (state.money < cost) return
    state.money -= cost
    state.moneySpent += cost
    state[field] += upgradeSteps[field](state[field])
    updateLabels()
    updateButtons()
    if (key === 'autoClick') restartAutoClick()
    if (key === 'storyBonus') hud.menuButtons.storyBonus.show()
    sounds.play(SOUNDS.upgrade, 0.5)
  }

  function upgradeTexts(key) {
    const cost = t('buttons', 'cost') + formatNumber(costs[UPGRADES[key][1]])
    const value = state[UPGRADES[key][0]]
    switch (key) {
      case 'power':
        return [`${t('caracteristics', 'power')} ${value}`, cost]
      case 'focus':
        return [`${t('caracteristics', 'focus')} ${value}`, cost]
      case 'critical':
        return [value === 0 ? t('buttons', 'unlockCritical') : `${t('caracteristics', 'critical')} ${value} %`, cost]
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
    }
  }

  function updateButtons() {
    costs = upgradeCosts(state, discount())
    for (const key of Object.keys(UPGRADES)) {
      const [field, costKey] = UPGRADES[key]
      const button = hud.upgrades[key]
      // Story bonuses can only be bought once a story's quizzes are all answered.
      const affordable = state.money >= costs[costKey] && (key !== 'storyBonus' || state.finishedQuizzIds.size > state.storyBonus)
      if (affordable) {
        button.show()
        button.setDisabled(false)
      } else if (state[field] > STARTING_VALUES[field]) {
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
      if (!ACHIEVEMENT_CONDITIONS[achievement.id]?.(state)) continue
      state.unlockedAchievementIds.add(achievement.id)
      showToast(stage, { title: achievement.name, description: achievement.description, image: achievement.image })
      hud.menuButtons.achievements.show()
    }
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
      refreshTime = 0
    }
    // Play time only counts while numbers are flying, i.e. while actually playing.
    if (effects.hasDigits) state.inGameTime += dt
    effects.update(dt)
    story.update(dt)
    requestAnimationFrame(frame)
  }

  // ---------- Input ----------

  function onKeyDown(event) {
    if (event.key === ' ') {
      event.preventDefault() // no page scroll, no click on the focused button
      if (performance.now() - lastSpacePress < SPACE_REPEAT_DELAY) return
      lastSpacePress = performance.now()
      hud.mainButton.classList.add('pressed')
      clickAtButtonCenter('manual')
    }
    hooks.emit('keydown', event.key)
  }

  function onKeyUp(event) {
    if (event.key !== ' ') return
    lastSpacePress = 0
    hud.mainButton.classList.remove('pressed')
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
      // Saves when the page is closed or hidden (closing the window saved in the Java version).
      addEventListener('pagehide', save)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save())
      requestAnimationFrame(frame)
    },
  }
}
