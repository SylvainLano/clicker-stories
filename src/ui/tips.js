import { element } from './dom.js'

const GAP = 12 // pixels between the bubble's tip and its target
const MARGIN = 6 // pixels kept between the bubble and the stage edges

// One-time tutorial bubbles. Each tip shows once, pointing at its target, until the player clicks it or does
// what it explains (done). One at a time: the others wait their turn. Nothing pauses meanwhile.
// state.seenTips: the tips already clicked away or done. text(id): the tip's text.
export function createTips(stage, { state, text }) {
  const queue = [] // { id, target }
  let shown = null // { id, target, bubble }

  // Offers a tip, unless already seen or waiting. target: an element, or a function returning one (it may move).
  function offer(id, target) {
    if (state.seenTips.has(id) || shown?.id === id || queue.some((entry) => entry.id === id)) return
    queue.push({ id, target })
    showNext()
  }

  // The player did what the tip explains: it is no longer needed, shown or not.
  function done(id) {
    state.seenTips.add(id)
    const waiting = queue.findIndex((entry) => entry.id === id)
    if (waiting >= 0) queue.splice(waiting, 1)
    if (shown?.id === id) hide()
  }

  function hide() {
    shown.bubble.remove()
    shown = null
    showNext()
  }

  function showNext() {
    if (shown) return
    while (queue.length) {
      const next = queue.shift()
      if (!targetOf(next)) continue // gone meanwhile (a fruit that fell): offered again next time
      const bubble = element('div', 'tip', text(next.id))
      bubble.addEventListener('click', () => done(next.id))
      stage.append(bubble)
      shown = { ...next, bubble }
      place()
      return
    }
  }

  const targetOf = ({ target }) => {
    const node = typeof target === 'function' ? target() : target
    return node?.isConnected && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' ? node : null
  }

  // Above the target when there is room, below otherwise; the pointer stays on the target's center.
  function place() {
    const node = targetOf(shown)
    // The target disappeared without the tip being done: it will be offered again.
    if (!node) return hide()
    const stageBox = stage.getBoundingClientRect()
    const box = node.getBoundingClientRect()
    const { bubble } = shown
    const width = bubble.offsetWidth
    const height = bubble.offsetHeight
    const centerX = box.left - stageBox.left + box.width / 2
    const above = box.top - stageBox.top - GAP - height >= MARGIN
    const left = Math.min(Math.max(centerX - width / 2, MARGIN), stageBox.width - width - MARGIN)
    const top = above ? box.top - stageBox.top - GAP - height : box.bottom - stageBox.top + GAP
    bubble.classList.toggle('tip-below', !above)
    bubble.style.left = `${left}px`
    bubble.style.top = `${top}px`
    bubble.style.setProperty('--pointer', `${centerX - left}px`)
  }

  return {
    offer,
    done,
    // Called every frame: the bubble follows its target.
    update() {
      if (shown) place()
    },
    // "See the tips again" (options): every tip can show once more.
    reset() {
      state.seenTips.clear()
      queue.length = 0
      if (shown) hide()
    },
  }
}
