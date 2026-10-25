import { defineConfig, searchForWorkspaceRoot } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import gameAssets from './vite-plugin-game-assets.js'

// An extension pack can add content on top of the base game.
// Set CS_EXTENSIONS to its folder (it must contain an index.js) to run or build with it.
const extensionsDir = process.env.CS_EXTENSIONS ? resolve(process.env.CS_EXTENSIONS) : null
// Assets that may be used by the game but not redistributed from this repository (see CREDITS.md).
const extraAssetsDir = process.env.CS_EXTRA_ASSETS ? resolve(process.env.CS_EXTRA_ASSETS) : null

export default defineConfig({
  // Relative base: works both locally and under a GitHub Pages sub-path.
  base: './',
  plugins: [
    gameAssets({
      publicAssets: fileURLToPath(new URL('./public/assets', import.meta.url)),
      extraAssets: extraAssetsDir,
    }),
  ],
  resolve: {
    alias: {
      '@extensions': extensionsDir
        ? resolve(extensionsDir, 'index.js')
        : fileURLToPath(new URL('./src/extensions/none.js', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), extensionsDir].filter(Boolean),
    },
  },
  build: {
    // Compiled code goes to bundle/, so it never mixes with the game's own assets/ folder.
    assetsDir: 'bundle',
    // Music files are large: keep them as plain files, never inline anything big.
    assetsInlineLimit: 4096,
  },
})
