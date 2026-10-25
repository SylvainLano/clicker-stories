// Minimal event hooks, so optional extension packs can react to what happens in the game.
export function createHooks() {
  const handlers = new Map()

  return {
    on(name, handler) {
      if (!handlers.has(name)) handlers.set(name, [])
      handlers.get(name).push(handler)
    },
    emit(name, ...args) {
      for (const handler of handlers.get(name) ?? []) handler(...args)
    },
  }
}
