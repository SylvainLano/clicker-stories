// element('div', 'a b', 'text', child1, child2...)
export function element(tag, className, text, ...children) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  node.append(...children)
  return node
}

export function setVisible(node, visible) {
  // Hidden elements keep their place in the layout, as setVisible(false) did in JavaFX.
  node.style.visibility = visible ? '' : 'hidden'
}
