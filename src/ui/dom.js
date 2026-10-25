// element('div', 'a b', 'text', child1, child2...)
export function element(tag, className, text, ...children) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  node.append(...children)
  return node
}

// Shows a small pixel art image at the largest whole multiple of its size that fits in `box` pixels,
// so that its pixels stay square and sharp. Images bigger than the box are simply fitted (smoothly).
export function fitPixelImage(image, box) {
  image.addEventListener(
    'load',
    () => {
      const largest = Math.max(image.naturalWidth, image.naturalHeight)
      const scale = largest > box ? box / largest : Math.floor(box / largest)
      image.style.width = `${image.naturalWidth * scale}px`
      image.style.height = `${image.naturalHeight * scale}px`
      if (scale >= 1) image.classList.add('pixelated')
    },
    { once: true },
  )
  return image
}

export function setVisible(node, visible) {
  // Hidden elements keep their place in the layout, as setVisible(false) did in JavaFX.
  node.style.visibility = visible ? '' : 'hidden'
}
