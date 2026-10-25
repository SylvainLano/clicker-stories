import { createReadStream, existsSync, statSync } from 'node:fs'
import { cp, readdir, writeFile } from 'node:fs/promises'
import { extname, join, normalize, relative, resolve, sep } from 'node:path'

const MIME_TYPES = {
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

async function listFiles(folder) {
  if (!folder || !existsSync(folder)) return []
  const entries = await readdir(folder, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => `/${relative(folder, join(entry.parentPath, entry.name)).replaceAll('\\', '/')}`)
}

// Every asset path, from both folders: the game uses it to pick random sounds and backgrounds.
async function buildManifest(folders) {
  const paths = (await Promise.all(folders.map(listFiles))).flat()
  return [...new Set(paths)].filter((path) => path !== '/manifest.json').sort()
}

// The game's assets live in public/assets. Assets whose licence allows them in the game but not
// in this repository can be kept in another folder (CS_EXTRA_ASSETS): this plugin serves them next to
// public/assets during development, copies them into the build, and generates assets/manifest.json.
export default function gameAssets({ publicAssets, extraAssets }) {
  const folders = [publicAssets, extraAssets].filter(Boolean)
  let config

  return {
    name: 'game-assets',

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },

    configureServer(server) {
      // A relative base ("./") is served from "/" by the dev server.
      const prefix = `${config.base.startsWith('/') ? config.base : '/'}assets/`
      server.middlewares.use(async (request, response, next) => {
        const url = decodeURIComponent((request.url ?? '').split('?')[0])
        if (!url.startsWith(prefix)) return next()
        const path = url.slice(prefix.length)

        if (path === 'manifest.json') {
          response.setHeader('Content-Type', MIME_TYPES['.json'])
          return response.end(JSON.stringify(await buildManifest(folders)))
        }
        if (!extraAssets || existsSync(join(publicAssets, path))) return next()

        const file = resolve(extraAssets, normalize(path))
        if (!file.startsWith(resolve(extraAssets) + sep) || !existsSync(file)) return next()
        response.setHeader('Content-Type', MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream')
        response.setHeader('Content-Length', statSync(file).size)
        createReadStream(file).pipe(response)
      })
    },

    async writeBundle() {
      const target = join(config.build.outDir, 'assets')
      if (extraAssets) await cp(extraAssets, target, { recursive: true, force: false, errorOnExist: false })
      await writeFile(join(target, 'manifest.json'), JSON.stringify(await buildManifest(folders)))
    },
  }
}
