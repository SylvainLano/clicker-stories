import { assetUrl } from './assets.js'

// CSS family name -> font file.
const FONTS = {
  AnotherTypeWriter: '/fonts/atwriter.ttf',
  Nexhope: '/fonts/Nexhope.ttf',
  Mama: '/fonts/mama.ttf',
  Alagard: '/fonts/alagard.ttf',
  'Early GameBoy': '/fonts/EarlyGameBoy.ttf',
  'Roman New Times': '/fonts/Roman_New_Times.otf',
  LCDMono2: '/fonts/LCDMono2.TTF',
  Verve: '/fonts/Verve.ttf',
  Minecraft: '/fonts/Minecraft.ttf',
}

// A font the browser rejects falls back to the CSS fallback instead of blocking the game.
export async function loadFonts() {
  await Promise.all(
    Object.entries(FONTS).map(async ([family, path]) => {
      try {
        const face = new FontFace(family, `url("${assetUrl(path)}")`)
        document.fonts.add(await face.load())
      } catch {
        console.warn(`Font "${family}" (${path}) could not be loaded.`)
      }
    }),
  )
}
