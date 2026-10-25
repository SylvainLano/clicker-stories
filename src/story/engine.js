import { listAssets, pickRandom, resolveUrl } from '../assets.js'
import { FRUITS, SEEDS_EXTRA_TIME } from '../game/buffs.js'
import { experienceForLevel, formatNumber, idiv } from '../game/formulas.js'
import { element } from '../ui/dom.js'
import { showToast } from '../ui/toast.js'
import { CONTENT, NIGHT_SKY, prepareBlocks, storyConfig } from './content.js'
import { markBlockRead, markQuizzAnswered, markStoryStarted, nextUnreadBlock, storyIdOf, unansweredBlockIds } from './progress.js'

const TYPING_SPEED = 60 // characters per second (one per frame at JavaFX's 60 fps)
const MAX_DIGITS = 20
const BACKGROUND_FADE = 1000

const SOUNDS = {
  go: '/sound/effects/click-go.wav',
  stop: '/sound/effects/click-stop.wav',
  alarm: '/sound/effects/Digital_Alarm.wav',
  collect: '/sound/effects/Collect Item sound effect.mp3',
  chestCreak: '/sound/effects/Chest Creak.mp3',
  goldenChest: '/sound/effects/golden_chest.mp3',
  fruitChest: '/sound/effects/fruit_chest.mp3',
}

const randomInt = (bound) => Math.floor(Math.random() * bound)
const random = (min, max) => min + Math.random() * (max - min)

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

// Picks an index among the first `count` items, earlier ones being likelier (weights 2n-1, 2n-2... n).
function pickWeightedIndex(count) {
  const weights = Array.from({ length: count }, (_, i) => count * 2 - 1 - i)
  let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0)
  for (let i = 0; i < count; i++) {
    roll -= weights[i]
    if (roll <= 0) return i
  }
  return count - 1
}

// The story area: types the current block letter by letter as the player clicks, then fills a progress
// circle, then moves on to the next block or to other content (jokes, facts, events, quizzes...).
export function createStoryEngine({ game, content, hooks, t, backdrop }) {
  const { state, hud, sounds, music, stage } = game
  const keyboardSounds = listAssets('sound/effects/typewriter/')

  // ---------- Story area elements ----------

  const lcdTimer = element('div', 'lcd-timer')
  const lcdCount = element('div', 'lcd-count')
  const storyText = element('span')
  const textFlow = element('div', 'textflow', '', storyText)
  const progressCircle = element('div', 'progress-circle')
  progressCircle.hidden = true
  hud.story.append(lcdTimer, textFlow, progressCircle, lcdCount)

  // ---------- Current content ----------

  let file = 'welcome'
  let type = CONTENT.MESSAGE
  let blocks = prepareBlocks(content, file, type, state)
  let index = 0
  let typed = 0 // characters of the block already processed
  let unlocked = 0 // characters the player's clicks allow to type
  let text = ''
  let typingClock = 0
  let maxDigits = MAX_DIGITS
  let config = storyConfig(content, 'default')
  let backgroundPath = NIGHT_SKY
  let backgroundLayer = null

  // State of the running event (timed challenge, reflex test, chests, quiz).
  const event = { countdown: 0, alternator: false, ending: true, lost: false, counter: 0, time: 0, reward: 0, chests: [] }

  const current = () => blocks[index]

  function render() {
    storyText.textContent = text
  }

  function setProgress(fraction) {
    progressCircle.style.setProperty('--progress', `${Math.max(0, Math.min(1, fraction)) * 360}deg`)
    progressCircle.dataset.percent = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`
  }

  function clearWidgets() {
    textFlow.replaceChildren(storyText)
  }

  function rewardDigit(textValue, position = game.buttonCenter()) {
    game.digit(position.x, position.y, textValue, 'reward')
  }

  // ---------- Look: cursor, button skin, background, music ----------

  function loadConfig(id) {
    config = storyConfig(content, id)
  }

  function applyConfig() {
    game.setCustomCursor(config.normalCursor ? { normal: config.normalCursor, hover: config.hoverCursor || null } : null)
    game.setButtonSkin(config.mainButtonCSS)
  }

  // Fades the current background out, then the new one in (darkened, so that the text stays readable).
  function changeBackground(path) {
    if (path === backgroundPath) return
    backgroundPath = path
    backdrop?.show(resolveUrl(path))
    const layer = element('div', 'background-layer')
    layer.style.backgroundImage = `url("${resolveUrl(path)}")`
    layer.style.opacity = 0
    const previous = backgroundLayer
    backgroundLayer = layer
    stage.querySelector('.backgrounds').append(layer)
    const fadeIn = () =>
      layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: BACKGROUND_FADE, fill: 'forwards' })
    if (previous) {
      previous.animate([{ opacity: 1 }, { opacity: 0 }], { duration: BACKGROUND_FADE, fill: 'forwards' }).finished.then(() => {
        previous.remove()
        fadeIn()
      })
    } else {
      setTimeout(fadeIn, BACKGROUND_FADE)
    }
  }

  function changeMusic(block) {
    const volume = hooks.transform('musicVolume', block.musicVolume, { file, type, index })
    music.change(block.musicPath, volume)
    game.setCredits(block.musicCredits ?? '')
  }

  // ---------- Typing (one character per frame) ----------

  function typeCharacter() {
    const block = current()
    if (typed === 0) {
      // Story blocks after the title remind which story they belong to.
      if (type === CONTENT.STORY && index !== 0 && index !== blocks.length - 1) {
        text += `${blocks[0].text.replaceAll('\n', ' ')}\n\n`
      }
      changeMusic(block)
      applyConfig()
    }
    if (typed === block.delay) {
      changeBackground(hooks.transform('blockBackground', block.backgroundPath, { file, type, index }))
    }
    if (typed < block.text.length) text += block.text[typed]
    if (keyboardSounds.length) sounds.play(pickRandom(keyboardSounds), 0.75)
    render()
    typed++
    // The more text is waiting to be typed, the fewer numbers fly from clicks.
    maxDigits = Math.max(2, MAX_DIGITS - idiv(unlocked - typed, 2))
  }

  // ---------- A click on the main button ----------

  function animate() {
    const block = current()
    if (typed >= block.weight) completeBlock()
    else if (typed >= block.text.length) afterTyping(block)
    else {
      if (typed === 0) startBlock(block)
      unlocked += randomInt(Math.trunc(Math.log(state.power) + 1)) + 1
      unlocked = Math.min(unlocked, current().text.length)
    }
  }

  function startBlock(block) {
    storyText.className = block.style ?? ''
    textFlow.className = `textflow ${block.style === 'long-text' ? 'text-display' : 'title-display'}`
    if (type === CONTENT.STORY && index === 0) textFlow.classList.add('story-title')

    if (type === CONTENT.STORY && index === 1 && markStoryStarted(state, file)) {
      hud.menuButtons.stories.show()
      showToast(stage, {
        title: blocks[0].text.replaceAll('\n', ' '),
        description: t('achievements', 'newStory'),
        image: config.hoverCursor,
        titleClass: blocks[0].style,
        side: 'left',
      })
    } else if (type === CONTENT.TIMED && unlocked <= 0) {
      startTimedChallenge(block)
    } else if (type === CONTENT.STATIC) {
      if (block.trigger === 'money') {
        event.reward = eventReward(Math.trunc(state.level * state.criticalPower * state.moneyGain * random(0.5, 1.5) * 20))
        block.text = block.text.replace('{reward}', formatNumber(event.reward * 5))
      }
      unlocked = 200
      event.counter = 0
    } else if (type === CONTENT.QUIZZ && event.counter === 0) {
      unlocked = 0
      block.text += '\n\n\n'
    }
    hooks.emit('blockStart', { file, type, index, block })
  }

  // ---------- Timed challenges ----------

  // Limes multiply the rewards of the events started while they are active.
  const eventReward = (reward) => Math.trunc(reward * (game.buffValue('eventReward') ?? 1))

  function startTimedChallenge(block) {
    const { level, power, focus, critical, criticalPower } = state
    const harder = (number) => Math.trunc((number * level) / 2) * (1 + critical) * (1 + criticalPower)
    switch (block.trigger) {
      case 'money':
        event.reward = Math.trunc(level * criticalPower * state.moneyGain * random(0.5, 1.5) * 20)
        break
      case 'experience':
        event.reward = Math.trunc((random(0.5, 1.5) * (experienceForLevel(level + 1) - experienceForLevel(level))) / 100)
        break
      case 'power':
        event.reward = Math.max(idiv(power, 10), 1)
        block.number *= Math.max(idiv(critical, 5), 1)
        break
      case 'focus':
        event.reward = Math.max(idiv(focus, 10), 1)
        break
      case 'critical':
        event.reward = 1
        block.number = harder(block.number)
        break
      case 'criticalPower':
        event.reward = Math.max(idiv(criticalPower, 10), 1)
        block.number = harder(block.number)
        break
    }
    event.reward = eventReward(event.reward)
    let duration = block.delay - randomInt(Math.trunc(Math.log(power) + level))
    for (let i = 0; i < game.activeStoryBonuses('moretime'); i++) duration = Math.trunc(duration * 1.25)
    if (game.hasBuff('seeds')) duration += SEEDS_EXTRA_TIME
    block.delay = duration
    block.text = block.text.replace('{reward}', formatNumber(event.reward)).replace('{number}', block.number)
    unlocked = 200
    event.counter = 0
  }

  function giveTimedReward(block) {
    const label = (key) => t('caracteristics', key)
    let display = ''
    switch (block.trigger) {
      case 'money':
        event.reward = game.addMoney(event.reward)
        display = `$${formatNumber(event.reward)}`
        break
      case 'experience':
        event.reward = game.addExperience(event.reward)
        display = `${formatNumber(event.reward)} XP`
        game.checkLevelUp()
        break
      case 'power':
        state.power += event.reward
        display = `${label('power')} + ${event.reward}`
        break
      case 'focus':
        state.focus += event.reward
        display = `${label('focus')} + ${event.reward}`
        break
      case 'critical':
        state.critical += event.reward
        display = `${label('critical')} + ${event.reward} %`
        break
      case 'criticalPower':
        state.criticalPower += event.reward
        display = `${label('critical')} x + ${event.reward}`
        break
    }
    if (['critical', 'criticalPower'].includes(block.trigger)) {
      loadConfig('default')
      applyConfig()
    }
    game.updateLabels()
    game.updateButtons()
    rewardDigit(display)
    lcdTimer.textContent = ''
    lcdCount.textContent = ''
    sounds.play(SOUNDS.collect, 0.5)
    game.restartAutoClick()
    state.eventsWon++
  }

  function loseTimedChallenge(block) {
    block.text = t('events', 'lose')
    unlocked = block.text.length
    block.weight = unlocked + 150
    event.reward = 0
    event.lost = true
    typed = 0
    text = ''
    render()
    lcdTimer.textContent = ''
    lcdCount.textContent = ''
    sounds.play(SOUNDS.alarm, 0.5)
    loadConfig('default')
    applyConfig()
    event.ending = true
    setProgress(0)
    state.eventsLost++
    game.restartAutoClick()
  }

  // ---------- Text fully typed: progress circle, or the event's own interaction ----------

  function afterTyping(block) {
    // The player's current stats, with buffs and story bonuses (chest contents depend on them).
    let circleSpeed = 1
    let fruitFactor = state.fruitFactor
    let focus = state.focus
    let moneyGain = state.moneyGain
    let critical = state.critical
    for (const buff of game.buffs) {
      if (buff.name === 'progressCircle') circleSpeed += buff.value
      else if (buff.name === 'CURSED') fruitFactor = Math.trunc(fruitFactor / buff.value)
      else if (buff.name === 'fullFocus') focus = Math.trunc(focus * buff.value)
      else if (buff.name === 'fruitFactor') fruitFactor = Math.trunc(fruitFactor * buff.value)
      else if (buff.name === 'moneyGain') moneyGain = Math.trunc(moneyGain * buff.value)
      else if (buff.name === 'criticalBoth') critical = Math.trunc(critical * buff.value)
    }
    fruitFactor += 2 * game.activeStoryBonuses('fruits+2')

    if (type === CONTENT.TIMED && !event.ending && ['redgreen', 'critical', 'miss'].includes(block.type)) {
      lcdCount.textContent = String(event.counter)
      if (event.counter >= block.number) block.weight = 0
    } else if (type === CONTENT.STATIC && block.type === 'chests' && !event.alternator) {
      if (event.countdown === 0 && event.counter === 0) showChests({ focus, fruitFactor, moneyGain, critical })
      else if (event.counter >= 1) openChest(block, fruitFactor)
    } else if (type === CONTENT.QUIZZ && event.countdown === 0) {
      if (event.counter === 0) showAnswers(block)
      else if (event.counter > 1) checkAnswer(block)
    } else if (type !== CONTENT.STATIC || event.countdown > 500) {
      const length = block.text.length
      setProgress((typed - length) / (block.weight - length))
      progressCircle.hidden = false
      typed += randomInt(Math.trunc(Math.log(state.power) + 1)) + circleSpeed
    }
  }

  // ---------- Chests ----------

  const CHESTS = {
    MONEY: { look: 'wooden', sound: null },
    EXP: { look: 'wooden', sound: null },
    NOTHING: { look: 'wooden', sound: null },
    BLACK: { look: 'black', sound: SOUNDS.chestCreak },
    GOLD: { look: 'golden', sound: SOUNDS.goldenChest },
    FRUITS: { look: 'white', sound: SOUNDS.fruitChest },
  }

  function showChests({ focus, fruitFactor, moneyGain, critical }) {
    const gifts = ['MONEY', 'EXP', 'NOTHING']
    if (state.errorNumber + focus + fruitFactor > state.power) gifts.push('BLACK', 'NOTHING', 'NOTHING')
    if (moneyGain * 3 < state.power + critical) gifts.push('GOLD', 'MONEY')
    if (fruitFactor > 0) for (let i = randomInt(fruitFactor); i > 0; i--) gifts.push('FRUITS')
    shuffle(gifts)

    event.chests = gifts.slice(0, 3).map((gift, i) => {
      const chest = element('button', `chest chest-${CHESTS[gift].look}`)
      chest.dataset.gift = gift
      chest.addEventListener('click', () => {
        if (event.counter >= 1) return
        event.counter = i + 1
        animate()
        sounds.play(CHESTS[gift].sound ?? `/sound/effects/chest_open_${randomInt(3)}.mp3`, 1)
      })
      return chest
    })
    textFlow.append(element('div', 'chests', '', ...event.chests))
    event.countdown++
  }

  function openChest(block, fruitFactor) {
    const chest = event.chests[event.counter - 1]
    const gift = chest.dataset.gift
    typed = 0
    event.countdown = 9000
    text = ''
    render()
    chest.classList.add('opened')

    if (gift === 'NOTHING') {
      block.text = t('events', 'emptyChest')
      state.emptyChests++
    } else {
      const stageBox = stage.getBoundingClientRect()
      const box = chest.getBoundingClientRect()
      const position = { x: box.left - stageBox.left + box.width / 2, y: box.top - stageBox.top + box.height / 2 }
      const experienceNeeded = experienceForLevel(state.level + 1) - experienceForLevel(state.level)

      if (gift === 'EXP') {
        const gain = game.addExperience(Math.trunc((random(0.5, 1.5) * experienceNeeded) / 200))
        block.text = `${t('events', 'rightChest')}${formatNumber(gain)} XP!`
        rewardDigit(`${formatNumber(gain)} XP`, position)
        game.checkLevelUp()
        state.regularChests++
      } else if (gift === 'MONEY') {
        const gain = game.addMoney(Math.trunc(state.level * state.criticalPower * state.moneyGain * random(0.5, 1.5) * 20))
        block.text = `${t('events', 'rightChest')} $${formatNumber(gain)}!`
        rewardDigit(`$${formatNumber(gain)}`, position)
        state.regularChests++
      } else if (gift === 'BLACK') {
        const experience = game.addExperience(Math.trunc((random(0.5, 1.5) * experienceNeeded) / 20))
        const money = game.addMoney(Math.trunc(state.level * state.criticalPower * random(0.5, 1.5) * 200))
        rewardDigit(`${formatNumber(experience)} XP`, position)
        rewardDigit(`$${formatNumber(money)}`, position)
        block.text = `${t('events', 'blackChest')} $${formatNumber(money)}, ${formatNumber(experience)} XP, ${t('events', 'endBlackChest')}`
        fruitFactor *= 5
        game.activateBuff('CURSED', 'CURSED', 5, 500)
        game.checkLevelUp()
        state.blackChests++
      } else if (gift === 'GOLD') {
        const upgrades = [
          ['criticalPower', 'critical', (value) => `${t('caracteristics', 'critical')} x + ${value}`],
          ['power', 'power', (value) => `${t('caracteristics', 'power')} + ${value}`],
          ['focus', 'focus', (value) => `${t('caracteristics', 'focus')} + ${value}`],
          ['critical', 'critical', (value) => `${t('caracteristics', 'critical')} + ${value} %`],
          ['fruitFactor', 'fruits', (value) => `${t('caracteristics', 'fruits')} + ${value}`],
        ]
        const [field, label, display] = upgrades[Math.min(randomInt(6), 4)]
        const gain = Math.max(idiv(state[field], 5), 1)
        state[field] += gain
        rewardDigit(display(gain), position)
        block.text = `${t('events', 'goldenChest')}${t('caracteristics', label)}${t('events', 'by')}${gain}`
        fruitFactor += 50
        state.goldChests++
      } else if (gift === 'FRUITS') {
        block.text = t('events', 'fruitsChest')
        fruitFactor += 500
        state.whiteChests++
      }

      // Some fruits burst out of the chest. (The Java version looped forever when the threshold was 0.)
      const threshold = Math.trunc(Math.random() * 100)
      while (fruitFactor > 0 && fruitFactor + 1 > threshold) {
        game.effects.addFruit(position.x, position.y, pickRandom(FRUITS))
        state.appearedFruits++
        fruitFactor = Math.trunc(fruitFactor / 2)
      }
    }

    game.updateLabels()
    game.updateButtons()
    unlocked = block.text.length
    block.weight = unlocked + 100
    game.restartAutoClick()
    event.alternator = true
    setProgress(0)
    progressCircle.hidden = false
  }

  // ---------- Quizzes ----------

  function showAnswers(block) {
    const answers = shuffle(Object.entries(block.answers ?? {}))
    const buttons = answers.map(([key, answer]) => {
      const button = element('button', `custom-button quizz-button ${config.mainButtonCSS ?? ''}`, answer)
      button.addEventListener('click', () => {
        if (event.counter !== 1) return
        event.counter++
        event.alternator = key === 'right'
        animate()
      })
      return button
    })
    textFlow.append(
      element('div', 'quizz-answers', '', ...buttons),
    )
    // Long answers shrink to fit their button.
    for (const button of buttons) {
      let size = 20
      while (button.scrollWidth > button.clientWidth && size > 8) button.style.fontSize = `${--size}px`
    }
    event.counter++
  }

  function checkAnswer(block) {
    typed = 0
    progressCircle.hidden = true
    text = ''
    render()
    if (event.alternator) {
      state.goodAnswers++
      const needed = experienceForLevel(state.level + 1) - experienceForLevel(state.level)
      const gain = game.addExperience(Math.trunc((random(0.5, 1.5) * needed) / 200))
      block.text = `${t('quizz', 'rightAnswer')} ${formatNumber(gain)} XP!`
      unlocked = block.text.length
      block.weight = unlocked + 50
      rewardDigit(`${formatNumber(gain)} XP`)
      game.checkLevelUp()
      game.updateLabels()

      if (markQuizzAnswered(state, block.trigger, blocks)) {
        const storyId = storyIdOf(block.trigger)
        for (const bonus of game.storyBonuses) if (bonus.id === storyId) bonus.unlocked = true
        const title = content.files.get(storyId)?.[0]
        showToast(stage, {
          title: (title?.text ?? storyId).replaceAll('\n', ' '),
          description: t('achievements', 'endQuizz'),
          image: config.hoverCursor || '/images/buttons/story-bonus-icon.webp',
          titleClass: title?.style,
          side: 'left',
        })
      }
    } else {
      state.badAnswers++
      block.text = t('quizz', 'wrongAnswer')
      unlocked = block.text.length
      block.weight = unlocked + 200
    }
    clearWidgets()
    event.countdown++
    game.restartAutoClick()
  }

  // Read story blocks that have a quiz question not answered yet: "storyBlockUplifting1-3"...
  function availableQuestions() {
    return unansweredBlockIds(state).filter((id) => {
      const quizzFile = storyIdOf(id).replace('story', 'quizz')
      return content.files.get(quizzFile)?.some((question) => question.trigger === id)
    })
  }

  // ---------- Block finished: what comes next ----------

  function completeBlock() {
    const block = current()
    const questions = availableQuestions()
    let storyChance = 1
    let timedChance = state.level < 4 ? 0 : 0.1
    let staticChance = timedChance
    let quizzChance = questions.length / 10
    for (const buff of game.buffs) {
      if (buff.name === 'storyChance') storyChance *= buff.value
      else if (buff.name === 'eventChance') {
        timedChance *= buff.value
        staticChance *= buff.value
      } else if (buff.name === 'quizzChance') quizzChance *= buff.value
      else if (buff.name === 'CURSED') {
        storyChance /= buff.value
        quizzChance /= buff.value
        timedChance /= buff.value
        staticChance /= buff.value
      }
    }
    const eventBonus = Math.pow(1.5, game.activeStoryBonuses('events'))
    timedChance *= eventBonus
    staticChance *= eventBonus

    if (type === CONTENT.TIMED && !event.lost) giveTimedReward(block)

    if (block.style === 'long-text') state.longTextTotal++
    else if (block.style === 'small-paragraph') state.paragraphTotal++
    else state.oneWordTotal++

    if (type === CONTENT.STORY && markBlockRead(state, file, index, blocks)) {
      showToast(stage, {
        title: blocks[0].text.replaceAll('\n', ' '),
        description: t('achievements', 'endStory'),
        image: config.hoverCursor,
        titleClass: blocks[0].style,
        side: 'left',
      })
    }

    const continues =
      (file === 'welcome' && index < 2) ||
      (type === CONTENT.MESSAGE && index < blocks.length - 2) ||
      (type === CONTENT.STORY && (index === 0 || index === blocks.length - 2))
    if (continues) index++
    else {
      clearWidgets()
      chooseNextContent({ storyChance, timedChance, staticChance, quizzChance, questions })
    }

    typed = 0
    unlocked = 0
    progressCircle.hidden = true
    text = ''
    render()
    animate()
  }

  function chooseNextContent({ storyChance, timedChance, staticChance, quizzChance, questions }) {
    const started = state.startedStoryIds.size
    const finished = state.finishedStoryIds.size
    const level = state.level
    const chances = {
      jokes: 0.5,
      stats: level < 4 ? 0 : (level % 6) / 8,
      facts: 0.5,
      timed: timedChance + idiv(level, 10),
      static: staticChance + idiv(level, 10),
      quizz: (quizzChance * level) / 5,
      story: ((level + started * 1.5) * storyChance) / 10,
    }
    // Without a story in progress, a new one is much likelier (unless they are all finished).
    if (started === 0) chances.story = finished === content.storyFiles.length ? 0 : chances.story + 1
    if (state.finishedQuizzIds.size === game.storyBonuses.length || type === CONTENT.QUIZZ) chances.quizz = 0

    // A roll landing on the kind already shown moves on to the next kind, but never to an impossible one
    // (in the Java version, two facts in a row could start an event before level 4).
    let roll = Math.random() * Object.values(chances).reduce((sum, chance) => sum + chance, 0)
    const pick = (kind) => chances[kind] > 0 && (roll -= chances[kind]) < 0
    let selectedQuestion = null

    if (pick('jokes') && type !== CONTENT.JOKES) [file, type] = [`jokesBlock${randomInt(3) + 1}`, CONTENT.JOKES]
    else if (pick('stats') && type !== CONTENT.STATS) {
      ;[file, type] = ['statsBlock', CONTENT.STATS]
      game.save()
    } else if (pick('facts') && type !== CONTENT.FACTS) [file, type] = [`factsBlock${randomInt(2) + 1}`, CONTENT.FACTS]
    else if (pick('timed') && type !== CONTENT.TIMED) [file, type] = ['timedEventBlock', CONTENT.TIMED]
    else if (pick('static') && type !== CONTENT.STATIC) {
      ;[file, type] = ['staticEventBlock', CONTENT.STATIC]
      event.countdown = 0
    } else if (pick('quizz') && type !== CONTENT.QUIZZ && questions.length > 0) {
      selectedQuestion = pickRandom(questions)
      ;[file, type] = [storyIdOf(selectedQuestion).replace('story', 'quizz'), CONTENT.QUIZZ]
    } else chooseStory(started)

    blocks = prepareBlocks(content, file, type, state)
    setUpContent(selectedQuestion)
  }

  // Mostly continues a story in progress, sometimes starts a new one.
  function chooseStory(started) {
    if (Math.random() * (started * 3 + 1) >= started && started > 0) {
      ;[file, type] = [pickRandom([...state.startedStoryIds]), CONTENT.STORY]
      return
    }
    const unfinished = content.storyFiles.filter((name) => !state.finishedStoryIds.has(name))
    if (unfinished.length === 0) [file, type] = ['completed', CONTENT.MESSAGE]
    else [file, type] = [pickRandom(unfinished), CONTENT.STORY]
  }

  function setUpContent(selectedQuestion) {
    switch (type) {
      case CONTENT.STORY:
        index = nextUnreadBlock(state, file, blocks)
        if (index >= 1) changeBackground(blocks[index - 1].backgroundPath)
        loadConfig(file)
        break
      case CONTENT.MESSAGE:
        index = 0
        loadConfig(file)
        break
      case CONTENT.TIMED:
        event.time = 0
        event.ending = false
        event.lost = false
        index = pickWeightedIndex(Math.min(state.level, blocks.length))
        if (current().type === 'redgreen') {
          loadConfig('greenEvent')
          event.countdown = random(1, 3)
          event.alternator = true
          event.counter = 0
        } else loadConfig('default')
        applyConfig()
        game.stopAutoClick()
        break
      case CONTENT.STATIC:
        event.time = 0
        index = pickWeightedIndex(Math.min(state.level * 2, blocks.length))
        if (current().type === 'reflexe') {
          loadConfig('redEvent')
          event.countdown = random(3, 9)
        } else loadConfig('default')
        event.alternator = false
        applyConfig()
        game.stopAutoClick()
        break
      case CONTENT.QUIZZ:
        index = Math.max(0, blocks.findIndex((block) => block.trigger === selectedQuestion))
        loadConfig(storyIdOf(selectedQuestion))
        event.time = 0
        event.alternator = false
        event.counter = 0
        event.countdown = 0
        game.stopAutoClick()
        break
      default:
        // Jokes, facts, statistics: a random one, which takes longer to charge as you progress.
        index = randomInt(blocks.length)
        loadConfig(file)
        current().weight += randomInt(state.power) * state.level
    }
  }

  // ---------- Every frame ----------

  function updateTimedChallenge(dt) {
    const block = current()
    const timeLeft = Math.round(block.delay - event.time)
    if (timeLeft <= 0) return loseTimedChallenge(block)
    lcdTimer.textContent = `Time left : ${timeLeft}`
    if (block.type !== 'redgreen') return
    // Red light, green light: the button switches every 1 to 3 seconds.
    event.countdown -= dt
    if (event.countdown > 0) return
    loadConfig(event.alternator ? 'redEvent' : 'greenEvent')
    sounds.play(event.alternator ? SOUNDS.stop : SOUNDS.go, 0.5)
    event.alternator = !event.alternator
    applyConfig()
    event.countdown = random(1, 3)
  }

  // Reflex test: wait for the green button, then click as fast as possible.
  function updateReflexTest(block) {
    if (event.counter >= 1 && event.alternator) {
      typed = 1
      const seconds = Math.round(event.time * 100) / 100
      const gain = Math.round(1 / seconds) * event.reward
      block.weight = 150
      block.text = `${t('events', 'took')}${seconds}${t('events', 'toclick')}${formatNumber(gain)} ${block.trigger}!`
      if (block.trigger === 'money') {
        game.addMoney(gain)
        game.updateLabels()
        game.updateButtons()
      }
      rewardDigit(`$${formatNumber(gain)}`)
      event.reward = 0
      text = ''
      render()
      event.alternator = false
      game.restartAutoClick()
    }
    if (event.countdown <= event.time) {
      loadConfig('greenEvent')
      applyConfig()
      event.alternator = true
      sounds.play(SOUNDS.go, 0.5)
      event.time = 0
      event.countdown = 100000
      event.counter = 0
    }
  }

  return {
    get maxDigits() {
      return maxDigits
    },

    // Called by the game for each click that hits.
    animate,

    // Before a click is resolved. During a reflex test, clicking too early always misses (and delays the green light).
    beforeHit(roll) {
      if (type !== CONTENT.STATIC || current().type !== 'reflexe') return roll
      if (event.alternator) event.counter++
      else if (event.reward !== 0) {
        roll = 200
        if (event.time > 3) event.countdown = Math.min(15, event.countdown + 1)
      }
      animate()
      return roll
    },

    // After a click: timed challenges count misses, critical hits, or points scored on green.
    afterHit({ kind, increase }) {
      if (type !== CONTENT.TIMED) return
      const challenge = current().type
      if (challenge === 'miss' && kind === 'miss') event.counter++
      if (challenge === 'critical' && (kind === 'critical-digit' || kind === 'autocritical-digit')) event.counter++
      if (challenge === 'redgreen' && increase !== 0) event.counter += event.alternator ? increase : -increase
    },

    // Watermelons give the timed challenge in progress more time.
    extendTimedChallenge(seconds) {
      if (type === CONTENT.TIMED && !event.ending) current().delay += seconds
    },

    allowsCritical: () => !hooks.emit('blocksCritical', { file, type, index }),

    update(dt) {
      event.time += dt
      typingClock += dt
      while (typingClock >= 1 / TYPING_SPEED) {
        typingClock -= 1 / TYPING_SPEED
        if (typed < unlocked) typeCharacter()
        else typingClock = 0
      }

      if (type === CONTENT.TIMED && !event.ending) updateTimedChallenge(dt)
      else if (type === CONTENT.STATIC) {
        const block = current()
        if (block.type === 'reflexe') updateReflexTest(block)
        if (typed <= 1) animate()
      }
    },

    // Returning players skip the welcome message: their first click brings new content.
    start({ returning }) {
      if (state.level > 1) {
        index = 2
        typed = Infinity
      } else if (returning) animate()
    },

    // Lets the hidden layer switch to its own content.
    play({ file: newFile, type: newType, blocks: newBlocks, index: newIndex = 0 }) {
      ;[file, type, blocks, index] = [newFile, newType, newBlocks, newIndex]
      typed = 0
      unlocked = 0
      progressCircle.hidden = true
      text = ''
      clearWidgets()
      render()
    },
  }
}
