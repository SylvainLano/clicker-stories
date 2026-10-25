import './style.css'
import './ui/game.css'
import './story/story.css'
import installExtensions from '@extensions'
import { version } from '../package.json'
import { assetUrl, listAssets, loadManifest, manifest, resolveUrl } from './assets.js'
import { createMusicPlayer, createSoundPlayer } from './audio.js'
import { LANGUAGES, loadData, loadLocalized, loadTranslator } from './data.js'
import { loadFonts } from './fonts.js'
import { createGame } from './game/game.js'
import { createState, loadState } from './game/state.js'
import { createHooks } from './hooks.js'
import { defineImageVariables } from './images.js'
import { AMBIENT_MUSIC, NIGHT_SKY, loadContent } from './story/content.js'
import { createStoryEngine } from './story/engine.js'
import { fillStoriesMenu, fillStoryBonusMenu, showBlock } from './story/menus.js'
import { element, fitPixelImage } from './ui/dom.js'
import { createBackdrop } from './ui/backdrop.js'
import { createEffects } from './ui/effects.js'
import { createHud } from './ui/hud.js'
import { createMenuPane } from './ui/menus.js'

const TITLE_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']
const MENU_SOUNDS = { open: '/sound/effects/Menu_In.wav', close: '/sound/effects/Menu_Out.wav' }

const stage = document.getElementById('stage')
const backdrop = createBackdrop(document.getElementById('backdrop'))
const hooks = createHooks()

// Browsers only allow sound after a user gesture, so the game starts on a click.
function showStartScreen(onStart) {
  const screen = element('div', 'start-screen')
  screen.style.backgroundImage = `url("${assetUrl('/images/backgrounds/loader.webp')}")`
  backdrop.show(assetUrl('/images/backgrounds/loader.webp'))
  const title = element('h1', 'start-title', 'Clicker Stories')
  screen.append(title, element('p', 'start-hint', 'Click to start'), element('p', 'start-version', `v${version}`))
  stage.append(screen)

  let colorIndex = 0
  title.style.color = TITLE_COLORS[colorIndex]
  const colorTimer = setInterval(() => {
    colorIndex = (colorIndex + 1) % TITLE_COLORS.length
    title.style.color = TITLE_COLORS[colorIndex]
  }, 1000)

  screen.addEventListener(
    'click',
    () => {
      clearInterval(colorTimer)
      screen.remove()
      onStart()
    },
    { once: true },
  )
}

async function startGame() {
  const savedState = loadState()
  const state = savedState ?? createState()
  let translate = await loadTranslator(state.lang)
  const t = (category, key) => translate(category, key)

  const [{ colors }, achievements, storyBonuses, content] = await Promise.all([
    loadData('progressbar_colors.json'),
    loadLocalized(state.lang, 'achievements.json'),
    loadLocalized(state.lang, 'storyBonuses.json'),
    loadContent(state.lang),
  ])
  for (const bonus of storyBonuses) {
    bonus.unlocked = state.finishedQuizzIds.has(bonus.id)
    bonus.activated = state.activatedStoryBonus.has(bonus.id)
  }

  let musicOn = true
  const sounds = createSoundPlayer()
  const music = createMusicPlayer({ isMuted: () => !musicOn })
  const menuMusic = createMusicPlayer({ isMuted: () => !musicOn })
  const setCredits = (text) => game.setCredits(text)

  stage.style.backgroundImage = `url("${assetUrl(NIGHT_SKY)}")`
  backdrop.show(assetUrl(NIGHT_SKY))

  let game
  const hud = createHud(stage, {
    click: (event) => game.onMainButtonClick(event),
    upgrade: (key) => game.buy(key),
    openStories: () => openMenu(storiesMenu, fillStories),
    openStoryBonus: () => openMenu(storyBonusMenu, fillStoryBonuses),
    openAchievements: () => openMenu(achievementsMenu, fillAchievements),
    openOptions: () => openMenu(optionsMenu, fillOptions),
    toggleSfx() {
      sounds.enabled = !sounds.enabled
      hud.soundButtons.sfx.setStyle(sounds.enabled ? 'sound-button' : 'nosound-button')
    },
    toggleMusic() {
      musicOn = !musicOn
      hud.soundButtons.music.setStyle(musicOn ? 'music-button' : 'nomusic-button')
      music.refreshVolume()
      menuMusic.refreshVolume()
    },
  })
  const effects = createEffects(hud.effects, {
    onFruitCaught: (...args) => game.onFruitCaught(...args),
    catchesByItself: () => game.hasBuff('magnet'),
  })
  game = createGame({ stage, state, hud, effects, sounds, music, hooks, t, colors, achievements, storyBonuses })
  const story = createStoryEngine({ game, content, hooks, t, backdrop })
  game.setStory(story)

  // ---------- Menus ----------

  // Opening a menu pauses the game: no auto-clicks, the menu has its own music.
  function closeMenu() {
    game.restartAutoClick()
    music.togglePause()
    menuMusic.stop()
    sounds.play(MENU_SOUNDS.close, 0.5)
  }

  function openMenu(menu, fill) {
    fill()
    game.stopAutoClick()
    music.togglePause()
    menuMusic.start(AMBIENT_MUSIC.file, 1)
    setCredits(AMBIENT_MUSIC.credits)
    menu.open()
    sounds.play(MENU_SOUNDS.open, 0.5)
  }

  const storiesMenu = createMenuPane(stage, { panelClass: 'planks stories-panel', onClose: closeMenu })
  const storyBonusMenu = createMenuPane(stage, { panelClass: 'planks-white', onClose: closeMenu })
  const achievementsMenu = createMenuPane(stage, { panelClass: 'planks-white', onClose: closeMenu })

  function fillStories() {
    fillStoriesMenu(storiesMenu.box, {
      state,
      content,
      hooks,
      // Rereading a block brings back its picture and its music.
      openBlock({ backgroundPath, text, musicPath, musicCredits, musicVolume }) {
        showBlock(stage, { background: resolveUrl(backgroundPath), text })
        menuMusic.change(musicPath, musicVolume > 0 ? musicVolume : 0.5, 1)
        setCredits(musicCredits ?? '')
      },
    })
  }

  function fillStoryBonuses() {
    fillStoryBonusMenu(storyBonusMenu.box, { state, storyBonuses, sounds, onChange: fillStoryBonuses })
  }
  const optionsMenu = createMenuPane(stage, { panelClass: 'planks-white', onClose: closeMenu })

  function fillAchievements() {
    // Unlocked first; hidden achievements only show once unlocked.
    const shown = achievements
      .filter((achievement) => state.unlockedAchievementIds.has(achievement.id) || !achievement.hidden)
      .sort((a, b) => state.unlockedAchievementIds.has(b.id) - state.unlockedAchievementIds.has(a.id))
    const grid = element('div', 'achievement-grid')
    for (const achievement of shown) {
      const unlocked = state.unlockedAchievementIds.has(achievement.id)
      const icon = fitPixelImage(element('img'), 42)
      icon.src = assetUrl(unlocked ? achievement.image : '/images/buttons/achievement-icon-locked.webp')
      icon.alt = ''
      grid.append(
        element(
          'div',
          `achievement-block${unlocked ? '' : ' locked'}`,
          '',
          icon,
          element(
            'div',
            '',
            '',
            element('div', unlocked ? 'achievement-title' : 'achievement-title-locked', achievement.name),
            element('div', unlocked ? 'achievement-description' : 'achievement-description-locked', achievement.description),
          ),
        ),
      )
    }
    achievementsMenu.box.replaceChildren(grid)
  }

  function fillOptions() {
    const languageRow = element('div', 'options-row', '', element('span', '', t('menus', 'language')))
    for (const language of LANGUAGES) {
      const flag = element('img')
      flag.src = assetUrl(`/images/buttons/flags/${language}.webp`)
      flag.alt = language
      const button = element('button', `lang-button${language === state.lang ? ' current' : ''}`, '', flag)
      button.addEventListener('click', () => changeLanguage(language))
      languageRow.append(button)
    }
    optionsMenu.box.replaceChildren(element('div', 'options-row', '', element('span', '', t('menus', 'options'))), languageRow)
  }

  async function changeLanguage(language) {
    if (language === state.lang) return
    state.lang = language
    translate = await loadTranslator(language)
    hud.mainButton.textContent = t('buttons', 'main')
    game.updateLabels()
    game.updateButtons()
    fillOptions()
  }

  // ---------- Start ----------

  // Extensions get the game first, so that they see everything that follows.
  hooks.emit('start', { state, game, story, hud, effects, sounds, music, stage, t })
  hud.mainButton.textContent = t('buttons', 'main')
  music.start(AMBIENT_MUSIC.file, 1)
  setCredits(AMBIENT_MUSIC.credits)
  if (savedState) hud.showSaveStatus(t('statusLabel', 'loaded'))
  game.start({ gunshotSounds: listAssets('sound/effects/gunshot/') })
  const hasStories = state.startedStoryIds.size > 0 || state.finishedStoryIds.size > 0
  if (hasStories) hud.menuButtons.stories.show()
  story.start({ returning: hasStories })
  // Development only: inspect or tweak the game from the browser console.
  if (import.meta.env.DEV) window.clickerStories = { state, game, story, effects }
}

async function main() {
  await Promise.all([loadManifest(), loadFonts()])
  defineImageVariables(manifest())
  // A failing extension pack must not prevent the base game from starting.
  try {
    await installExtensions({ hooks, assetUrl })
  } catch (error) {
    console.error('Extensions could not be installed:', error)
  }
  showStartScreen(startGame)
}

main()
