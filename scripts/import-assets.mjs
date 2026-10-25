// Imports the original Java game's resources, keeping only what the web game uses:
// - images become WebP (cursors stay PNG: browsers don't reliably accept WebP cursors),
// - JSON data is copied to data/ with its image paths updated.
//
// Usage: node scripts/import-assets.mjs [--source <Java resources folder>] [--exclude-from <file>]
//                                       [--public-from <file> --other-target <folder>]
// Rule files list, one per line, paths relative to the Java resources (a trailing "/" means a whole folder).
// --exclude-from: files to leave out entirely.
// --public-from:  files whose licence allows them in this repository (see CREDITS.md); they go to public/assets.
//                 Every other file goes to --other-target. Game data (datas/) is always public.
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_SOURCE = resolve(
  REPO_ROOT,
  '../2023-09-16 - Clicker Stories 0.0.4/2023-09-16 - Clicker Stories 0.0.4/src/main/resources',
)
const PUBLIC_TARGET = resolve(REPO_ROOT, 'public/assets')

// Never used by the game, or replaced by hand-written web code.
const UNUSED = [
  'css/', // JavaFX stylesheets, rewritten as web CSS in src/
  'sound/background/Alex-Productions - Epic Adventures Electronic Upbeat.mp3',
  'sound/background/Kevin MacLeod - In Your Arms.mp3',
  'sound/background/Savfk  - Ultra.mp3',
  'images/backgrounds/stories/sciencefantasy/TheNexusChronicles/LyraTheSorceress.png',
  'images/backgrounds/stories/timetravel/', // story not written yet
  'fonts/deat.ttf',
  'fonts/Infinite.ttf',
  'fonts/joystix.otf',
  'fonts/rainyhearts.ttf',
  'fonts/RetroGaming.ttf',
]
const UNUSED_EXTENSIONS_IN = { 'sound/background/': ['.wav'] } // uncompressed masters, never referenced

// Images heavier than this are photos/paintings: lossy WebP, resized. Lighter ones (UI, pixel art): lossless.
const LOSSY_THRESHOLD = 200 * 1024
const MAX_BACKGROUND_SIZE = { width: 1600, height: 1200 }

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, excludeFrom: null, publicFrom: null, otherTarget: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') args.source = argv[++i]
    else if (argv[i] === '--exclude-from') args.excludeFrom = argv[++i]
    else if (argv[i] === '--public-from') args.publicFrom = argv[++i]
    else if (argv[i] === '--other-target') args.otherTarget = argv[++i]
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  if (Boolean(args.publicFrom) !== Boolean(args.otherTarget)) {
    throw new Error('--public-from and --other-target go together.')
  }
  return args
}

async function readRules(file) {
  if (!file) return []
  return (await readFile(file, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

const matches = (path, rules) => rules.some((rule) => (rule.endsWith('/') ? path.startsWith(rule) : path === rule))

async function listFiles(folder) {
  const entries = await readdir(folder, { withFileTypes: true, recursive: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name))
}

function isUnused(path) {
  if (matches(path, UNUSED)) return true
  return Object.entries(UNUSED_EXTENSIONS_IN).some(
    ([folder, extensions]) => path.startsWith(folder) && extensions.includes(extname(path).toLowerCase()),
  )
}

function outputPath(path) {
  if (path.startsWith('datas/')) return path.replace(/^datas\//, 'data/')
  if (/\.(png|jpe?g)$/i.test(path) && !path.startsWith('images/cursors/')) return path.replace(/\.(png|jpe?g)$/i, '.webp')
  return path
}

// "/images/x.png" -> "/images/x.webp", the same way outputPath() renames the files.
function rewriteImagePaths(json) {
  return json.replace(/"(\/images\/[^"]+)\.(png|jpe?g)"/gi, (match, path) =>
    path.startsWith('/images/cursors/') ? match : `"${path}.webp"`,
  )
}

async function convertImage(from, to) {
  const { size } = await stat(from)
  const image = sharp(from)
  if (size > LOSSY_THRESHOLD) {
    await image
      .resize({ ...MAX_BACKGROUND_SIZE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(to)
  } else {
    await image.webp({ lossless: true }).toFile(to)
  }
}

async function importFile(from, to) {
  await mkdir(dirname(to), { recursive: true })
  if (from.endsWith('.json')) {
    const json = rewriteImagePaths((await readFile(from, 'utf8')).replace(/^﻿/, ''))
    JSON.parse(json) // fail loudly on invalid data rather than at play time
    await writeFile(to, json)
  } else if (to.endsWith('.webp')) {
    await convertImage(from, to)
  } else {
    await copyFile(from, to)
  }
}

async function runInBatches(items, size, task) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(task))
  }
}

async function folderSize(folder) {
  const sizes = await Promise.all((await listFiles(folder)).map(async (file) => (await stat(file)).size))
  return sizes.reduce((total, size) => total + size, 0)
}

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const source = resolve(args.source)
  const excluded = await readRules(args.excludeFrom)
  const publicRules = await readRules(args.publicFrom)
  const otherTarget = args.otherTarget && resolve(args.otherTarget)

  const paths = (await listFiles(source)).map((file) => relative(source, file).replaceAll('\\', '/'))
  const kept = paths.filter((path) => !isUnused(path) && !matches(path, excluded))
  const isPublic = (path) => !otherTarget || path.startsWith('datas/') || matches(path, publicRules)

  await rm(PUBLIC_TARGET, { recursive: true, force: true })
  if (otherTarget) await rm(otherTarget, { recursive: true, force: true })
  await runInBatches(kept, 8, (path) =>
    importFile(join(source, path), join(isPublic(path) ? PUBLIC_TARGET : otherTarget, outputPath(path))),
  )

  const publicCount = kept.filter(isPublic).length
  console.log(`Imported ${kept.length} of ${paths.length} files.`)
  console.log(`  public/assets: ${publicCount} files, ${megabytes(await folderSize(PUBLIC_TARGET))}`)
  if (otherTarget) {
    console.log(`  ${otherTarget}: ${kept.length - publicCount} files, ${megabytes(await folderSize(otherTarget))}`)
  }
}

main()
