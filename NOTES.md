# Build notes

A running record of what each step delivered and the decisions behind it, so a
later session can pick up without re-deriving context.

## Step 0 — melodic converter core

`abcToSong(abcText, cfg)` in `src/convert.js`. abcjs `parseOnly`, no MIDI hop.
One ABC voice -> one SoundBox track; chords fill a track's 4 note-columns; the
row grid is the LCM of the note-duration denominators (manual `rowsPerBeat`
override available); note length is not encoded (instrument envelope decides).
Playground in `index.html`, Node checks in `smoke.mjs`.

## Step 1 — per-voice instrument mapping (sidecar) — PROTOTYPED, THEN REVERTED

A sidecar-JSON mechanism was built and tested, then reverted before commit. Kept
here only as a record of what was tried and why it was dropped.

What the prototype did:

- `cfg.sidecar`: `{ instruments: { name: [29 ints] }, voices: { "0:0": { instrument, transpose } } }`
- per-voice resolution chain: sidecar -> `KIT.pad` fallback
- `validInstrument()` warned on wrong array length and on `FX_FREQ`/`FX_DRIVE` = 0
  (either zero silences the track in the player) — worth keeping this check
  wherever instruments get resolved
- per-voice `transpose`; `meta.voiceMap` reporting; a playground textarea

Why reverted:

- **The instrument path should be ABC-native: `%%MIDI program N` + a curated
  GM -> SoundBox preset kit** (Step 5). The ABC file stays the single source of
  truth; no second file to keep in sync.
- `transpose` duplicated ABC's own `V:1 transpose=-12` / `%%MIDI transpose`.
- A sidecar override may return much later if a real need appears, but not now.

`%%MIDI program` parsing is picked up with the other `%%MIDI` directives
(channel, drummap).

## Plan (reordered after "keep it realistic, no artificial limits")

Faithful conversion: SoundBox's format bends by adding tracks, never by dropping
notes or merging instruments. Chords past 4 notes fan out to extra tracks; each
distinct drum is its own track; `%%MIDI program` picks a real family patch.

1. GM instrument kit  <- done
2. wire `%%MIDI program` -> melodic patch + chord fan-out past 4 columns
3. drums: full GM percussion -> one track per distinct drum
4. repeats / endings: `p` sequence re-references shared `c` patterns (compact,
   not duplicated data)

## Step 1 (reordered) — GM instrument kit

`src/kit.js`:

- `MELODIC` — 16 patches, one per GM family; `melodicForProgram(program)` returns
  the family key via `program >> 3`, `GM_FAMILY` is the index->key table
- `PERCUSSION` — 17 named drum patches; `percForNote(note)` maps GM notes 35..81
  to the nearest one (`PERC_NOTE` is the explicit table)
- `DEFAULT_MELODIC` = "piano" for voices with no program
- every patch keeps FX_FREQ and FX_DRIVE non-zero (either zero => silent player)

`smoke.mjs` renders every patch as a single note and asserts 29 params + audible
(peak > 0.005 scanning from t~0, since percussion can be under 20 ms).

First pass — recognizable, not sampled. `sfx` is intentionally quiet (noise
effect). Refine by ear later.

## Step 2 — `%%MIDI program` + chord fan-out

- Pass 1 reads `el_type:"midi"` items in the voice stream: `cmd:"program"` sets
  the voice program, `cmd:"channel"` with param 10 flags it as a drum voice.
  `%%MIDI program` before any `V:` (in `tune.formatting.midi.program`) is the
  default for every voice.
- `melodicForProgram(program)` = `MELODIC[GM_FAMILY[program >> 3]]`.
- Chords past four notes fan out: a voice becomes `ceil(maxChord / 4)` tracks
  sharing the instrument; notes 0..3 fill track 0's columns, 4..7 track 1, etc.
  The old "truncate to 4" warning is gone.
- `meta.voiceMap[key]` reports the resolved family (and program number).
- `buildTrack(instr, patternMap)` helper builds `{ i, p, c }` from a
  patternIdx -> n-array map (used by melodic and drum paths).

## Step 3 — drums

- A `%%MIDI channel 10` voice is routed as percussion.
- `%%MIDI drummap <noteName> <gmNote>` is parsed in convert.js (seeded from
  `tune.formatting.midi.drummap`, overlaid by per-voice `cmd:"drummap"` items) —
  we do NOT rely on abcjs folding it into `note.midipitch`, which it only does
  with a `perc` clef.
- Per drum note: GM number = `drummap[noteName]` ?? `note.midipitch` ?? chromatic
  pitch. `percForNote(gm)` picks the patch.
- One SoundBox track per distinct percussion patch used. Each drum plays at the
  fixed note `DRUM_NOTE` (128) — the patch's OSC1_SEMI carries its tuning, the
  written pitch only selected the drum.
- `meta.voiceMap[key]` = `"drums: kick, snare, hatClosed"`.

## Still open

- Repeats / endings: `|: :|` and `|1 |2` are not yet expanded into the `p`
  sequence — a repeated section currently plays once.
- Instrument patches are unrefined first-pass guesses (see Step 1).
- `%%MIDI transpose` / `V: transpose=` not handled.
