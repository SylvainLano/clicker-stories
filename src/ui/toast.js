import { assetUrl } from '../assets.js'
import { element, fitPixelImage } from './dom.js'

const SLIDE_DURATION = 1000
const SHOWN_DURATION = 5000

// Slides a little card in from the top of the stage, then back out (AchievementAnimation in Java).
// Achievements appear on the right, notifications (started/finished stories...) on the left.
export function showToast(stage, { title, description, image, titleClass = 'achievement-title', side = 'right' }) {
  const icon = fitPixelImage(element('img', 'toast-icon'), 32)
  icon.src = assetUrl(image)
  icon.alt = ''
  const card = element(
    'div',
    `toast toast-${side}`,
    '',
    icon,
    element('div', 'toast-texts', '', element('div', titleClass, title), element('div', 'achievement-description', description)),
  )
  stage.append(card)

  // A keyframe's easing applies to the segment that starts with it.
  const easing = 'cubic-bezier(0.25, 0.1, 0.25, 1)'
  const total = 2 * SLIDE_DURATION + SHOWN_DURATION
  card
    .animate(
      [
        { transform: 'translateY(-50px)', easing },
        { transform: 'translateY(7px)', offset: SLIDE_DURATION / total },
        { transform: 'translateY(7px)', offset: (SLIDE_DURATION + SHOWN_DURATION) / total, easing },
        { transform: 'translateY(-50px)' },
      ],
      { duration: total },
    )
    .finished.then(() => card.remove())
}
