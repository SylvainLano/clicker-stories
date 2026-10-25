import { assetUrl } from '../assets.js'
import { element } from './dom.js'

const GRAVITY = 100
const FRUIT_SIZE = 24
// A fruit can only be caught once it has flown for a moment, so it isn't caught by the click that launched it.
const FRUIT_CATCH_DELAY = 0.5

// How each kind of flying number looks: starting scale and lifetime (seconds; default 1.5 to 2.5).
const DIGIT_KINDS = {
  'score-digit': { scale: 0.3 },
  'artificial-digit': { scale: 0.3 },
  miss: { scale: 0.3 },
  'critical-digit': { scale: 0.8 },
  'autocritical-digit': { scale: 0.8 },
  reward: { scale: 1, duration: 6 },
  'levelup-digit': { scale: 1, duration: 6 },
}

const random = (min, max) => min + Math.random() * (max - min)

// Ballistic motion shared by every effect: launched from (x, y) at a speed, then falls.
function launch(node, x, y, xSpeed, ySpeed, duration) {
  return { node, x, y, xSpeed, ySpeed, duration, time: 0 }
}

function positionAt(item) {
  return {
    x: item.x + item.xSpeed * item.time,
    y: item.y + item.ySpeed * item.time + 0.5 * GRAVITY * item.time * item.time,
  }
}

// Particles take the accent color, randomly varied, brightened and contrasted (as in Java's Particle).
function varyColor(hex) {
  const base = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const varied = base.map((channel) => channel + Math.random() * 0.5 - 0.25 + 0.5)
  const average = varied.reduce((sum, channel) => sum + channel, 0) / 3
  const [red, green, blue] = varied.map((channel) => Math.round(Math.max(0, Math.min(1, average + (channel - average) * 2)) * 255))
  return `rgb(${red}, ${green}, ${blue})`
}

// All moving effects live in `layer` (stage coordinates, origin at the top left) and are updated by update(dt).
export function createEffects(layer, { onFruitCaught }) {
  const digits = []
  const particles = []
  const fruits = []

  function addParticle(x, y, color) {
    const node = element('div', 'particle')
    node.style.background = varyColor(color)
    layer.append(node)
    const speed = random(50, 100)
    const angle = random(0, 2 * Math.PI)
    particles.push(launch(node, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, random(1.5, 2.5)))
  }

  // options: { scale, duration, className, font } for kinds not listed in DIGIT_KINDS.
  function addDigit(x, y, text, kind, { maxDigits = 20, ...options } = {}) {
    while (digits.length >= maxDigits) digits.shift().node.remove()
    const settings = { ...DIGIT_KINDS[kind], ...options }
    const node = element('div', `digit ${settings.className ?? kind}`, text)
    if (settings.font) node.style.font = settings.font
    layer.append(node)
    const speed = random(125, 200)
    const angle = random((11 / 8) * Math.PI, (13 / 8) * Math.PI)
    const digit = launch(node, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, settings.duration ?? random(1.5, 2.5))
    digit.scale = settings.scale ?? 0.3
    digits.push(digit)
  }

  function addFruit(x, y, fruit) {
    const node = element('img', 'fruit')
    node.src = assetUrl(`/images/fruits/fruit-${fruit}.webp`)
    node.alt = ''
    layer.append(node)
    const speed = random(125, 200)
    const angle = random((5 / 4) * Math.PI, (7 / 4) * Math.PI)
    const item = launch(node, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, random(3.5, 4.5))
    item.fruit = fruit
    item.rotationSpeed = (angle - (3 / 2) * Math.PI) * 250 // degrees per second
    // Caught by moving the mouse over it.
    node.addEventListener('mouseenter', () => {
      if (item.time > FRUIT_CATCH_DELAY) item.caught = true
    })
    fruits.push(item)
  }

  function updateList(list, dt, render) {
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i]
      item.time += dt
      if (item.time >= item.duration || item.caught) {
        list.splice(i, 1)
        item.node.remove()
        if (item.caught) onFruitCaught(item.fruit, positionAt(item))
        continue
      }
      const { x, y } = positionAt(item)
      render(item, x, y, item.time / item.duration)
    }
  }

  return {
    addDigit,
    addParticle,
    addFruit,
    get hasDigits() {
      return digits.length > 0
    },
    update(dt) {
      updateList(digits, dt, (item, x, y, progress) => {
        // Grows to 4 times its starting size while fading out.
        const scale = item.scale * (1 + 3 * progress)
        item.node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`
        item.node.style.opacity = 1 - progress
      })
      updateList(particles, dt, (item, x, y, progress) => {
        item.node.style.transform = `translate(${x}px, ${y}px)`
        item.node.style.opacity = 1 - progress
      })
      updateList(fruits, dt, (item, x, y) => {
        item.node.style.transform = `translate(${x - FRUIT_SIZE / 2}px, ${y - FRUIT_SIZE / 2}px) rotate(${item.time * item.rotationSpeed}deg)`
      })
    },
  }
}

// Shakes the whole stage a few pixels for a split second (critical hits).
export function shake(stage) {
  const dx = Math.trunc(random(-5, 5))
  const dy = Math.trunc(random(-5, 5))
  stage.animate([{ translate: '0 0' }, { translate: `${dx}px ${dy}px` }], {
    duration: 12,
    iterations: 6,
    direction: 'alternate',
  })
}
