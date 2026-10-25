// Minimal event hooks, so optional extension packs can react to what happens in the game.
export function createHooks() {
  const handlers = new Map()
  const listeners = (name) => handlers.get(name) ?? []

  return {
    on(name, handler) {
      if (!handlers.has(name)) handlers.set(name, [])
      handlers.get(name).push(handler)
    },
    // Returns true when a handler returned true, i.e. took care of the event itself.
    emit(name, ...args) {
      let handled = false
      for (const handler of listeners(name)) handled = handler(...args) === true || handled
      return handled
    },
    // Lets handlers change a value (each one receives what the previous one returned).
    transform(name, value, ...args) {
      return listeners(name).reduce((current, handler) => handler(current, ...args), value)
    },
  }
}
