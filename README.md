# abc2soundbox

Convert [ABC music notation](https://abcnotation.com/) into
[SoundBox](https://sb.bitsnbites.eu/) song arrays, for use in size-constrained
projects such as [js13kGames](https://js13kgames.com/) entries.

The converter parses ABC directly (via [abcjs](https://www.abcjs.net/)) rather
than going through MIDI, so bar structure, repeats, voices and chords stay
intact, and note onsets are quantized once against a row grid derived from the
score itself.

## Status

v1 slice: melodic voices only.

- one ABC voice → one SoundBox track
- chords fill a track's four note-columns
- the row grid is derived from note durations (no fixed resolution); a manual
  override is available
- note length is **not** encoded — an onset is placed on the grid and the
  instrument envelope decides how long it sounds

Not yet: sidecar instrument mapping, drum-voice routing, repeat expansion and
bar de-duplication, a curated instrument kit.

## Use

```sh
npm install
npm run serve   # opens the playground: paste ABC, Convert, Play, Copy song
npm run smoke   # Node structural + audio-not-silent test
```

## Files

- `src/convert.js` — the converter core, `abcToSong(abcText, cfg)`
- `src/kit.js` — placeholder SoundBox instruments
- `src/play.js` — render a song via CPlayer / play it in the browser
- `src/player-small.js` — vendored SoundBox player (CPlayer)
- `index.html` — the playground
- `smoke.mjs` — the test
