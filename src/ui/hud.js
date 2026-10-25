import { element, setVisible } from './dom.js'

// Two-line upgrade button (SquaredButton in the Java version).
function createUpgradeButton(onClick) {
  const lines = [element('span', 'line'), element('span', 'line')]
  const button = element('button', 'squared-button', '', ...lines)
  button.addEventListener('click', onClick)
  setVisible(button, false)
  return {
    element: button,
    show: () => setVisible(button, true),
    hide: () => setVisible(button, false),
    setDisabled: (disabled) => (button.disabled = disabled),
    setText(first, second) {
      lines[0].textContent = first
      lines[1].textContent = second
    },
  }
}

// Small icon button (SmallButton in the Java version); its look is a CSS class that can change.
function createIconButton(style, onClick) {
  const button = element('button', `icon-button ${style}`)
  button.addEventListener('click', onClick)
  setVisible(button, false)
  return {
    element: button,
    show: () => setVisible(button, true),
    hide: () => setVisible(button, false),
    setStyle: (newStyle) => (button.className = `icon-button ${newStyle}`),
  }
}

// Builds the game screen. `actions` holds the click handlers, keyed like the buttons.
export function createHud(stage, actions) {
  const upgrades = Object.fromEntries(
    ['power', 'critical', 'criticalPower', 'focus', 'autoClick', 'autoFire', 'moneyGain', 'experienceGain', 'fruit', 'storyBonus'].map(
      (key) => [key, createUpgradeButton(() => actions.upgrade(key))],
    ),
  )
  const menuButtons = {
    stories: createIconButton('story-button', actions.openStories),
    achievements: createIconButton('achievement-button', actions.openAchievements),
    storyBonus: createIconButton('story-bonus-button', actions.openStoryBonus),
  }
  const soundButtons = {
    sfx: createIconButton('sound-button', actions.toggleSfx),
    music: createIconButton('music-button', actions.toggleMusic),
    options: createIconButton('options-button', actions.openOptions),
  }
  for (const button of Object.values(soundButtons)) button.show()

  const mainButton = element('button', 'custom-button')
  const labels = {
    score: element('span', 'main-label'),
    money: element('span', 'main-label'),
    level: element('span', 'main-label'),
  }
  const progressFill = element('div', 'progress-fill')
  const buffs = element('div', 'buffs main-label')
  const saveStatus = element('div', 'save-status')
  const credits = element('div', 'credits')
  const story = element('div', 'story')
  const effects = element('div', 'effects')

  stage.append(
    element('div', 'backgrounds'),
    element('div', 'status-bar', '', saveStatus, credits),
    element(
      'div',
      'hud',
      '',
      element('div', 'upgrades upgrades-left', '', ...['storyBonus', 'fruit', 'experienceGain', 'moneyGain', 'autoClick'].map((key) => upgrades[key].element)),
      element('div', 'upgrades upgrades-right', '', ...['autoFire', 'focus', 'criticalPower', 'critical', 'power'].map((key) => upgrades[key].element)),
      element('div', 'icon-buttons icon-buttons-left', '', ...Object.values(menuButtons).map((button) => button.element)),
      element('div', 'icon-buttons icon-buttons-right', '', ...Object.values(soundButtons).map((button) => button.element)),
      buffs,
      story,
      element(
        'div',
        'main-controls',
        '',
        mainButton,
        element('div', 'main-labels', '', labels.score, labels.money, labels.level),
        element('div', 'progress-bar', '', progressFill),
      ),
    ),
    effects,
  )
  mainButton.addEventListener('click', actions.click)

  let saveStatusTimer
  return {
    mainButton,
    labels,
    upgrades,
    menuButtons,
    soundButtons,
    buffs,
    story,
    effects,
    setProgress: (progress) => (progressFill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`),
    setAccentColor: (color) => stage.style.setProperty('--accent', color),
    setCredits: (text) => (credits.textContent = text),
    // Shown, then fades out over 3 seconds.
    showSaveStatus(text) {
      saveStatus.textContent = text
      saveStatus.classList.remove('fading')
      void saveStatus.offsetWidth // restart the transition
      saveStatus.classList.add('fading')
      clearTimeout(saveStatusTimer)
      saveStatusTimer = setTimeout(() => (saveStatus.textContent = ''), 3000)
    },
  }
}
