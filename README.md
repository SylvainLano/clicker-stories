# Clicker Stories

A clicker game that tells stories: every click reveals a word, then a letter, of tales that unlock block by block — with their own backgrounds, music and cursors.

> **Status:** being ported from Java to JavaScript. The original game is not fully playable here yet.

## The game

Clicker Stories started in 2023 as a personal project. Its idea: a clicker where clicking doesn't just raise a number, it **writes a story**. Each click types a few more characters; at low levels you uncover a word at a time, later a whole letter-by-letter flow.

- **Stories in blocks.** Each story (mystery, steampunk, post-apocalyptic, science-fantasy, uplifting…) is split into chapters that unlock in order, each with its own background painting, music track, cursor and button style. Already-read chapters can be replayed from the Stories menu.
- **Between stories:** jokes, odd facts and statistics about your own playthrough.
- **Progression:** level, experience and money, plus upgrades: power, critical chance and power, focus (fewer missed clicks), money and experience gain, auto-click, bonus fruits, story bonuses.
- **Fruits:** clickable fruits occasionally pop out of your clicks and grant temporary buffs (apple, orange, banana, lemon, strawberry, cherry, peach, grape, pear, blueberry).
- **Events:** timed challenges (red light / green light, critical rush, miss rush), reflex tests, mystery chests (wooden, golden, white… and black), and quizzes on the stories you've read that unlock permanent story bonuses.
- **Achievements**, English and French interface, typewriter sounds, particles and fireworks.

## Why port it from Java to JavaScript

The 2023 version was written in Java with JavaFX, built with Maven, obfuscated with ProGuard and shipped as a JAR. It worked, but it aged badly:

- **Hard to run.** Players needed the right Java runtime *and* JavaFX, which hasn't been bundled with Java since version 11. Building it meant Maven, the JavaFX plugin, ProGuard and the shade plugin all agreeing on versions and paths — and ProGuard's configuration even pointed at a JDK folder on the original machine. A web page needs nothing: open a link and play.
- **Hard to maintain.** Almost all the game lived in a single 3,800-line class mixing UI, rules, audio and saves. Porting is the occasion to split it into small modules (game state, formulas, text engine, events, audio, effects).
- **A better fit for the game.** What the game does — styled text, CSS-skinned buttons, custom cursors, crossfading backgrounds and music, particles — is exactly what browsers are built for. JavaFX imitated web CSS (`-fx-` properties); now it's the real thing.
- **Simpler data.** Stories, quizzes and translations were already JSON: they are reused as they are, with no parsing library.
- **Saves that just work.** Progress is stored in the browser instead of a serialized Java object in the home folder.
- **Fast feedback while developing.** Vite reloads the page as soon as a file is saved, instead of a compile–package–launch cycle.
- **Easy to share.** The game is published as a static site on GitHub Pages: no installer, no download, nothing to update.

## Tech

- Plain JavaScript (ES modules) and CSS, no framework.
- [Vite](https://vite.dev) for the dev server and the build.
- [sharp](https://sharp.pixelplumbing.com) to convert the original images to WebP when importing assets.

## Development

Requires Node.js 20 or later.

```bash
npm install
npm run dev        # dev server with live reload
npm run build      # production build in dist/
npm run preview    # serve the production build
```

`public/assets/` was generated from the original Java game's resources by `scripts/import-assets.mjs` (unused files left out, images converted to WebP). The generated files are committed, so you don't need the Java sources to work on the game.

This repository only contains assets whose licence allows it. The others (most music, images and sounds) are licensed for use in the game but can't be redistributed from here: they are added when the full game is built (`CS_EXTRA_ASSETS`, see `vite.config.js`). A plain clone therefore runs with missing images and sounds.

## Credits

See [CREDITS.md](CREDITS.md). Music tracks are also credited in-game, at the bottom right of the screen, while they play.
