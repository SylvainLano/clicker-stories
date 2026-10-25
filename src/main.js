import './style.css'
import installExtensions from '@extensions'
import { assetUrl, loadManifest } from './assets.js'
import { loadFonts } from './fonts.js'
import { createHooks } from './hooks.js'

const TITLE_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']

const stage = document.getElementById('stage')
const hooks = createHooks()

function element(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

// Browsers only allow sound after a user gesture, so the game starts on a click.
function showStartScreen() {
  const screen = element('div', 'start-screen')
  screen.style.backgroundImage = `url("${assetUrl('/images/backgrounds/loader.webp')}")`
  const title = element('h1', 'start-title', 'Clicker Stories')
  screen.append(title, element('p', 'start-hint', 'Click to start'))
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
      startGame()
    },
    { once: true },
  )
}

function startGame() {
  stage.style.backgroundImage = `url("${assetUrl('/images/backgrounds/night_sky.webp')}")`
  stage.style.cursor = `url("${assetUrl('/images/cursors/cursor_level_1.png')}"), auto`

  const music = new Audio(assetUrl('/sound/background/Dar Golan Free Night Nature Soundscape.mp3'))
  music.loop = true
  music.play()

  hooks.emit('start')
}

async function main() {
  await Promise.all([loadManifest(), loadFonts()])
  await installExtensions({ hooks, assetUrl })
  showStartScreen()
}

main()
