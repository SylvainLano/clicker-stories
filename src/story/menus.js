import { assetUrl } from '../assets.js'
import { element, fitPixelImage } from '../ui/dom.js'
import { blockId } from './progress.js'

const BONUS_SOUNDS = { on: '/sound/effects/UI Message Appear 01.wav', off: '/sound/effects/Rotate Stone 03.wav' }

// Stories menu: one parchment per started or finished story, with a square per block; read blocks can be reread.
export function fillStoriesMenu(box, { state, content, hooks, openBlock }) {
  const storyIds = new Set([...state.startedStoryIds, ...state.finishedStoryIds])
  box.replaceChildren()
  for (const storyId of storyIds) {
    const blocks = content.files.get(storyId)
    if (!blocks) continue
    const { text: title, style } = blocks[0]
    const quizzesDone = state.finishedQuizzIds.has(storyId)
    const parchment = quizzesDone ? 'story-block-bonus' : state.finishedStoryIds.has(storyId) ? 'story-block-ended' : ''

    const squares = blocks.slice(1).map((_, i) => {
      const number = i + 1
      const read = quizzesDone || state.readStoryBlockIds.has(blockId(storyId, number))
      const square = element('button', `story-square ${read ? `${style}-read-button` : ''}`)
      if (read) square.addEventListener('click', () => openBlock(blocks[number]))
      else square.disabled = true
      return square
    })
    box.append(
      element('div', `story-block ${parchment}`, '', element('div', `${style}-menu`, title.replaceAll('\n', ' ')), element('div', 'story-squares', '', ...squares)),
    )
  }
  hooks.emit('storiesMenu', { box, openBlock })
}

// A reread block: its picture, and its text over it while the mouse is on it.
export function showBlock(stage, { background, text }) {
  const picture = element('div', 'reread-picture')
  picture.style.backgroundImage = `url("${background}")`
  const paragraph = element('p', 'reread-text', text)
  const panel = element('div', 'menu-panel reread-panel', '', picture, paragraph)
  const closeButton = element('button', 'close-button')
  const overlay = element('div', 'menu-overlay', '', panel, closeButton)
  closeButton.addEventListener('click', () => overlay.remove())
  stage.append(overlay)
}

// Story bonuses unlocked by finishing a story's quizzes; up to `state.storyBonus` can be active at once.
export function fillStoryBonusMenu(box, { state, storyBonuses, sounds, onChange }) {
  const grid = element('div', 'achievement-grid')
  for (const bonus of storyBonuses.filter((entry) => entry.unlocked)) {
    const icon = fitPixelImage(element('img', 'bonus-icon'), 32)
    icon.src = assetUrl(bonus.image)
    icon.alt = ''
    const toggle = element('button', 'bonus-toggle', '', icon)
    const canToggle = bonus.activated || state.activatedStoryBonus.size < state.storyBonus
    toggle.disabled = !canToggle
    toggle.addEventListener('click', () => {
      bonus.activated = !bonus.activated
      if (bonus.activated) state.activatedStoryBonus.add(bonus.id)
      else state.activatedStoryBonus.delete(bonus.id)
      sounds.play(bonus.activated ? BONUS_SOUNDS.on : BONUS_SOUNDS.off, 0.2)
      onChange()
    })
    grid.append(
      element(
        'div',
        `achievement-block${bonus.activated ? ' active' : ' locked'}`,
        '',
        toggle,
        element(
          'div',
          '',
          '',
          element('div', bonus.activated ? 'story-bonus-title' : 'story-bonus-title-locked', bonus.name),
          element('div', 'achievement-description', bonus.description),
        ),
      ),
    )
  }
  box.replaceChildren(grid)
}
