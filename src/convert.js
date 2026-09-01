// ABC -> SoundBox song object. v1 slice: melodic voices only.
//
// One ABC voice -> one or more SoundBox tracks. A chord fills a track's four
// note-columns (SoundBox reads c[p].n[row + col*patternLen] for col 0..3);
// chords past four notes fan out to extra tracks sharing the instrument.
// `%%MIDI program N` on a voice (or the tune) selects a GM family patch.
// A `%%MIDI channel 10` voice is a drum voice: each note's GM number (from the
// abcjs drummap, else its pitch) routes to a percussion patch, one track per
// distinct drum. Repeat handling arrives in a later pass.
//
// Note length is NOT encoded: an onset is placed on the grid and the following
// rows are left empty. How long the note sounds is the instrument envelope.
//
// The row grid is derived from the score: every note/rest duration (and the bar
// length) is approximated as a fraction, and rowsPerWhole is the LCM of the
// denominators, so every onset lands exactly on a row. A manual rowsPerBeat
// override forces a coarser grid at the cost of quantization.

import {
  MELODIC,
  DEFAULT_MELODIC,
  melodicForProgram,
  PERCUSSION,
  percForNote,
} from "./kit.js";

// SoundBox note n = MIDI + 75. The synth plays 0.003959503758 * 2^((n-128)/12) Hz,
// so n = 128 is F3 (MIDI 53), giving the constant offset below.
const SB_OFFSET = 75;

// Drums play at the SoundBox reference note; each percussion patch's OSC1_SEMI
// carries its own tuning, so the written drum pitch never reaches the oscillator.
const DRUM_NOTE = 128;

const STEP_SEMI = [0, 2, 4, 5, 7, 9, 11]; // semitone of C D E F G A B within the octave
const ACC_SEMI = { sharp: 1, flat: -1, natural: 0, dblsharp: 2, dblflat: -2 };

const mod = (n, m) => ((n % m) + m) % m;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a / gcd(a, b)) * b;

function parser() {
  const a = globalThis.ABCJS;
  if (!a || !a.parseOnly) throw new Error("abcjs (ABCJS global) not loaded");
  return a;
}

// Nearest fraction to x with denominator <= maxDen; returns the reduced denominator.
function toFraction(x, maxDen = 64, tol = 1e-4) {
  let bestNum = Math.round(x);
  let bestDen = 1;
  let bestErr = Math.abs(x - bestNum);
  for (let den = 2; den <= maxDen && bestErr > tol; den++) {
    const num = Math.round(x * den);
    const err = Math.abs(x - num / den);
    if (err < bestErr - 1e-12) {
      bestNum = num;
      bestDen = den;
      bestErr = err;
    }
  }
  const g = gcd(Math.abs(bestNum), bestDen) || 1;
  return { den: bestDen / g, err: bestErr };
}

// abcjs diatonic pitch (0 = middle C) -> MIDI, applying explicit accidental,
// then the running per-bar accidental, then the key signature.
function pitchToMidi(pitch, explicitAcc, keyAcc, barState) {
  const octave = Math.floor(pitch / 7);
  const step = mod(pitch, 7);
  const letter = "CDEFGAB"[step];
  const slot = letter + octave;
  let alter;
  if (explicitAcc != null) {
    alter = ACC_SEMI[explicitAcc] ?? 0;
    barState[slot] = alter;
  } else if (slot in barState) {
    alter = barState[slot];
  } else if (letter in keyAcc) {
    alter = keyAcc[letter];
  } else {
    alter = 0;
  }
  return 60 + 12 * octave + STEP_SEMI[step] + alter;
}

function readTempo(tune) {
  const t = tune.metaText && tune.metaText.tempo;
  if (t && t.bpm) {
    const beat = Array.isArray(t.duration)
      ? t.duration.reduce((a, b) => a + b, 0)
      : t.duration || 0.25;
    return t.bpm * (beat / 0.25); // normalize to quarter-note BPM
  }
  return 120;
}

function readMeter(staff) {
  const m = staff && staff.meter;
  if (!m) return { num: 4, den: 4 };
  if (m.type === "common_time") return { num: 4, den: 4 };
  if (m.type === "cut_time") return { num: 2, den: 2 };
  if (m.type === "specified" && m.value && m.value[0]) {
    return { num: +m.value[0].num, den: +m.value[0].den };
  }
  return { num: 4, den: 4 };
}

function keyAccidentals(staff) {
  const out = {};
  const acc = staff && staff.key && staff.key.accidentals;
  if (acc) for (const a of acc) out[a.note.toUpperCase()] = ACC_SEMI[a.acc] ?? 0;
  return out;
}

// Turn a patternIdx -> n-array map into a SoundBox track { i, p, c }.
function buildTrack(instr, cByPattern) {
  const maxP = Math.max(...cByPattern.keys());
  const p = [];
  const c = [];
  for (let pi = 0; pi <= maxP; pi++) {
    if (cByPattern.has(pi)) {
      c.push({ n: cByPattern.get(pi), f: [] });
      p.push(c.length);
    } else {
      p.push(0);
    }
  }
  return { i: instr.slice(), p, c };
}

export function abcToSong(abc, cfg = {}) {
  const octaveShift = cfg.octaveShift || 0;
  const warnings = [];

  const tunes = parser().parseOnly(abc);
  if (!tunes || !tunes.length) throw new Error("no tune parsed");
  const tune = tunes[0];
  const bpm = readTempo(tune);

  let meter = { num: 4, den: 4 };
  for (const line of tune.lines || []) {
    if (line.staff && line.staff[0]) {
      meter = readMeter(line.staff[0]);
      break;
    }
  }

  // `%%MIDI program` given before any V: applies to every voice as a default.
  const tuneMidi = (tune.formatting && tune.formatting.midi) || {};
  const midiProgram = (params) =>
    params && params.length ? (params.length >= 2 ? params[1] : params[0]) : null;
  const tuneProgram = midiProgram(tuneMidi.program);

  // `%%MIDI drummap <noteName> <gmNote>` -> GM percussion number, resolved here
  // rather than relying on abcjs to fold it into note.midipitch. Seeded from the
  // tune-level map; per-voice drummap directives overlay it below.
  const drummap = { ...(tuneMidi.drummap || {}) };

  // Pass 1: note events per voice, keyed "staffIdx:voiceIdx", plus every duration.
  const voices = new Map();
  const durations = new Set([meter.num / meter.den]); // the bar length is on the grid too
  for (const line of tune.lines || []) {
    if (!line.staff) continue;
    line.staff.forEach((staff, si) => {
      const keyAcc = keyAccidentals(staff);
      (staff.voices || []).forEach((items, vi) => {
        const key = si + ":" + vi;
        let v = voices.get(key);
        if (!v) voices.set(key, (v = { events: [], pos: 0, program: tuneProgram, drum: false }));
        let barState = {};
        for (const it of items) {
          if (it.el_type === "bar") {
            barState = {};
            continue;
          }
          if (it.el_type === "midi") {
            if (it.cmd === "program") v.program = midiProgram(it.params);
            else if (it.cmd === "channel" && it.params && it.params[0] === 10) v.drum = true;
            else if (it.cmd === "drummap" && it.params && it.params.length >= 2) {
              drummap[it.params[0]] = +it.params[1];
            }
            continue;
          }
          if (it.el_type !== "note") continue;
          const dur = it.duration || 0;
          if (dur > 0) durations.add(dur);
          if (!it.rest && it.pitches && it.pitches.length) {
            const midis = [];
            const gms = []; // drum-routing GM number: drummap by note name, else midipitch/pitch
            for (const p of it.pitches) {
              const base = pitchToMidi(p.pitch, p.accidental, keyAcc, barState);
              midis.push(base + 12 * octaveShift);
              const mapped = drummap[p.name];
              gms.push(mapped != null ? mapped : p.midipitch != null ? p.midipitch : base);
            }
            v.events.push({ pos: v.pos, midis, gms });
          }
          v.pos += dur;
        }
      });
    });
  }

  // Derive the row grid, or honor a manual override.
  let rowsPerWhole;
  if (cfg.rowsPerBeat) {
    rowsPerWhole = cfg.rowsPerBeat * 4;
  } else {
    rowsPerWhole = 1;
    for (const d of durations) {
      const { den, err } = toFraction(d);
      if (err > 1e-3) warnings.push(`duration ${d.toFixed(4)} off-grid; snapped`);
      rowsPerWhole = lcm(rowsPerWhole, den);
    }
  }
  const rowLen = Math.round((44100 * 240) / (bpm * rowsPerWhole));
  let patternLen = Math.round((rowsPerWhole * meter.num) / meter.den);
  if (patternLen < 1) patternLen = rowsPerWhole || 1;
  if (rowsPerWhole > 48 || patternLen > 64) {
    warnings.push(
      `fine grid (rowsPerWhole ${rowsPerWhole}, patternLen ${patternLen}); output will be larger`,
    );
  }

  // Pass 2: place each voice into one track, or several when a chord exceeds the
  // four note-columns (extra tracks share the instrument).
  const songData = [];
  let endPattern = 0;
  const voiceMap = {};

  for (const [key, v] of voices) {
    if (!v.events.length) continue;

    if (v.drum) {
      // One track per distinct GM percussion patch. The written pitch only
      // selected the drum; it then plays at the patch's own tuning.
      const lanes = new Map(); // patch name -> (patternIdx -> n array)
      for (const ev of v.events) {
        const row = Math.round(ev.pos * rowsPerWhole);
        const pIdx = Math.floor(row / patternLen);
        const rIdx = row % patternLen;
        if (pIdx > endPattern) endPattern = pIdx;
        for (const gm of ev.gms) {
          const patch = percForNote(gm);
          let lane = lanes.get(patch);
          if (!lane) lanes.set(patch, (lane = new Map()));
          let n = lane.get(pIdx);
          if (!n) lane.set(pIdx, (n = new Array(patternLen * 4).fill(0)));
          n[rIdx] = DRUM_NOTE;
        }
      }
      voiceMap[key] = `drums: ${[...lanes.keys()].join(", ")}`;
      for (const [patch, lane] of lanes) songData.push(buildTrack(PERCUSSION[patch], lane));
      continue;
    }

    const name = v.program != null ? melodicForProgram(v.program) : DEFAULT_MELODIC;
    voiceMap[key] = v.program != null ? `${name} (prog ${v.program})` : name;
    const instrument = MELODIC[name];

    const maxChord = v.events.reduce((m, e) => Math.max(m, e.midis.length), 1);
    const subMaps = Array.from({ length: Math.ceil(maxChord / 4) }, () => new Map());

    for (const ev of v.events) {
      const row = Math.round(ev.pos * rowsPerWhole);
      const pIdx = Math.floor(row / patternLen);
      const rIdx = row % patternLen;
      if (pIdx > endPattern) endPattern = pIdx;
      ev.midis.forEach((m, k) => {
        const sub = subMaps[Math.floor(k / 4)];
        let n = sub.get(pIdx);
        if (!n) sub.set(pIdx, (n = new Array(patternLen * 4).fill(0)));
        const idx = rIdx + (k % 4) * patternLen;
        if (n[idx]) warnings.push(`note collision at pattern ${pIdx} row ${rIdx} (grid too coarse)`);
        n[idx] = m + SB_OFFSET;
      });
    }

    for (const cByPattern of subMaps) {
      if (cByPattern.size) songData.push(buildTrack(instrument, cByPattern));
    }
  }

  if (!songData.length) throw new Error("no playable notes");
  for (const tr of songData) while (tr.p.length <= endPattern) tr.p.push(0);

  return {
    song: { songData, rowLen, patternLen, endPattern, numChannels: songData.length },
    meta: {
      bpm,
      meter,
      rowsPerWhole,
      rowLen,
      patternLen,
      endPattern,
      tracks: songData.length,
      voiceMap,
      warnings: [...new Set(warnings)],
    },
  };
}
