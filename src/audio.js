import { assetUrl } from './assets.js'

const clampVolume = (volume) => Math.min(1, Math.max(0, volume))

// Short sound effects through Web Audio: decoded once, then cheap to replay many times per second.
// Must be created after a user gesture (browsers keep audio locked until then).
export function createSoundPlayer() {
  const context = new AudioContext()
  const buffers = new Map()
  let enabled = true

  function load(path) {
    if (!buffers.has(path)) {
      buffers.set(
        path,
        fetch(assetUrl(path))
          .then((response) => response.arrayBuffer())
          .then((data) => context.decodeAudioData(data))
          .catch(() => null),
      )
    }
    return buffers.get(path)
  }

  // from/to: part of the sound to play, as fractions of its duration.
  async function play(path, volume, from = 0, to = 1) {
    if (!enabled) return
    const buffer = await load(path)
    if (!buffer || !enabled) return
    const source = context.createBufferSource()
    source.buffer = buffer
    const gain = context.createGain()
    gain.gain.value = clampVolume(volume)
    source.connect(gain).connect(context.destination)
    source.start(0, buffer.duration * from, buffer.duration * (to - from))
  }

  return {
    play,
    preload: load,
    get enabled() {
      return enabled
    },
    set enabled(value) {
      enabled = value
    },
  }
}

// Looping background music (files in /sound/background/, or blob:/data: URLs), cross-fading between tracks.
// When music is muted, tracks keep playing silently, as in the Java version.
export function createMusicPlayer({ isMuted }) {
  let current = null

  function fade(track, to, seconds, onDone) {
    clearInterval(track.fadeTimer)
    const from = track.element.volume
    const start = performance.now()
    track.fadeTimer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / (seconds * 1000))
      track.element.volume = clampVolume(from + (to - from) * progress)
      if (progress === 1) {
        clearInterval(track.fadeTimer)
        onDone?.()
      }
    }, 50)
  }

  function createTrack(file, volume) {
    const element = new Audio(/^(blob|data):/.test(file) ? file : assetUrl(`/sound/background/${file}`))
    element.loop = true
    element.volume = 0
    element.play().catch(() => {})
    return { file, volume, element, fadeTimer: null }
  }

  const audibleVolume = (track) => (isMuted() ? 0 : clampVolume(track.volume))

  return {
    get file() {
      return current?.file
    },
    // Restarts from the beginning, without fading.
    start(file, volume) {
      this.stop()
      current = createTrack(file, volume)
      current.element.volume = audibleVolume(current)
    },
    // Cross-fades to another track; does nothing if it is already playing.
    change(file, volume, seconds = 2) {
      if (current?.file === file) return
      const previous = current
      if (previous) fade(previous, 0, seconds, () => previous.element.pause())
      current = createTrack(file, volume)
      fade(current, audibleVolume(current), seconds)
    },
    togglePause() {
      if (!current) return
      if (current.element.paused) current.element.play().catch(() => {})
      else current.element.pause()
    },
    stop() {
      if (!current) return
      clearInterval(current.fadeTimer)
      current.element.pause()
      current = null
    },
    // Applies a mute/unmute.
    refreshVolume() {
      if (current) current.element.volume = audibleVolume(current)
    },
  }
}
