// A first-pass General MIDI instrument kit as SoundBox 29-number `i` arrays.
//
// Melodic: one patch per GM family (programs group into 16 families of 8, so
// `program >> 3` selects the patch). Percussion: one patch per common GM drum
// note, with `percForNote()` routing notes 35..81 to the nearest defined one.
//
// These are recognizable, not sampled — a first pass to refine by ear. Every
// patch keeps FX_FREQ (index 21) and FX_DRIVE (index 24) non-zero, or the
// player renders it silent.
//
// Index map: 0 osc1 wave, 1 osc1 vol, 2 osc1 semi, 3 osc1 xenv, 4 osc2 wave,
// 5 osc2 vol, 6 osc2 semi, 7 osc2 detune, 8 osc2 xenv, 9 noise vol, 10 attack,
// 11 sustain, 12 release, 13 exp decay, 14 arp chord, 15 arp speed, 16 lfo wave,
// 17 lfo amt, 18 lfo freq, 19 lfo->fx freq, 20 fx filter (1 hp / 2 lp / 3 bp),
// 21 fx freq, 22 fx resonance, 23 fx dist, 24 fx drive, 25 pan amt, 26 pan freq,
// 27 delay amt, 28 delay time.

// GM melodic families, index 0..15 == program >> 3.
export const GM_FAMILY = [
  "piano",
  "chromperc",
  "organ",
  "guitar",
  "bass",
  "strings",
  "ensemble",
  "brass",
  "reed",
  "pipe",
  "synthLead",
  "synthPad",
  "synthFx",
  "ethnic",
  "percussive",
  "sfx",
];

export const MELODIC = {
  // bright struck string: fast attack, exp decay
  piano: [2, 150, 128, 0, 3, 90, 128, 3, 0, 0, 3, 40, 60, 45, 0, 0, 0, 0, 0, 0, 2, 115, 0, 0, 40, 0, 0, 0, 0],
  // bell / vibes: sine pair an octave apart, long ringing release
  chromperc: [0, 180, 128, 0, 0, 110, 140, 0, 0, 0, 2, 18, 95, 90, 0, 0, 0, 0, 0, 0, 2, 150, 0, 0, 36, 0, 0, 30, 60],
  // drawbar organ: stacked squares, held, no decay
  organ: [1, 120, 128, 0, 1, 110, 140, 0, 0, 0, 2, 80, 22, 0, 0, 0, 0, 0, 0, 0, 2, 140, 0, 0, 32, 0, 0, 0, 0],
  // plucked string: medium pluck with exp decay
  guitar: [2, 170, 128, 0, 2, 90, 128, 5, 0, 0, 3, 30, 55, 60, 0, 0, 0, 0, 0, 0, 2, 120, 0, 0, 40, 0, 0, 0, 0],
  // electric bass: square+saw an octave down, short pluck
  bass: [1, 200, 116, 0, 2, 120, 116, 3, 0, 0, 2, 28, 45, 55, 0, 0, 0, 0, 0, 0, 2, 90, 0, 0, 40, 0, 0, 0, 0],
  // solo strings: detuned saws, slow attack, sustained
  strings: [2, 120, 128, 0, 2, 120, 128, 8, 0, 0, 35, 70, 72, 0, 0, 0, 0, 0, 0, 0, 2, 100, 0, 0, 34, 0, 0, 0, 0],
  // section / choir: softer, slow filter LFO
  ensemble: [2, 110, 128, 0, 3, 100, 128, 10, 0, 0, 40, 80, 82, 0, 0, 0, 0, 120, 4, 1, 2, 95, 0, 0, 32, 0, 0, 0, 0],
  // brass section: saw, medium attack, resonant bite, driven
  brass: [2, 160, 128, 0, 2, 110, 128, 4, 0, 0, 15, 55, 55, 0, 0, 0, 0, 0, 0, 0, 2, 130, 20, 0, 46, 0, 0, 0, 0],
  // reed (sax / clarinet): breathy via a little noise
  reed: [2, 140, 128, 0, 1, 90, 128, 3, 0, 20, 12, 55, 55, 0, 0, 0, 0, 0, 0, 0, 2, 118, 0, 0, 42, 0, 0, 0, 0],
  // pipe (flute / recorder): sine with air noise
  pipe: [0, 170, 128, 0, 0, 60, 140, 0, 0, 35, 14, 50, 52, 0, 0, 0, 0, 0, 0, 0, 2, 140, 0, 0, 38, 0, 0, 0, 0],
  // synth lead: bright saw, instant attack, delay space
  synthLead: [2, 180, 128, 0, 2, 120, 128, 6, 0, 0, 4, 45, 55, 0, 0, 0, 0, 0, 0, 0, 2, 150, 10, 0, 46, 0, 0, 60, 90],
  // synth pad: very slow attack, wide, moving filter, long tail
  synthPad: [2, 110, 128, 0, 3, 100, 128, 12, 0, 0, 45, 90, 95, 0, 0, 0, 0, 140, 3, 1, 2, 90, 0, 0, 32, 0, 0, 80, 110],
  // synth effects: noisy atmosphere with slow filter sweep
  synthFx: [3, 90, 128, 0, 2, 80, 131, 20, 0, 60, 40, 80, 90, 0, 0, 0, 0, 180, 2, 1, 2, 80, 40, 0, 36, 0, 0, 90, 120],
  // ethnic pluck (sitar / koto / kalimba): bright with strong exp decay
  ethnic: [2, 160, 128, 0, 0, 110, 140, 0, 0, 0, 2, 22, 50, 95, 0, 0, 0, 0, 0, 0, 2, 140, 20, 0, 42, 0, 0, 0, 0],
  // percussive (woodblock / taiko / tinkle): short pitched hit
  percussive: [0, 150, 128, 60, 0, 0, 128, 0, 0, 80, 2, 10, 35, 130, 0, 0, 0, 0, 0, 0, 2, 120, 0, 0, 42, 0, 0, 0, 0],
  // sound effects: noise burst with distortion
  sfx: [0, 60, 128, 0, 0, 0, 128, 0, 0, 200, 10, 40, 60, 45, 0, 0, 0, 0, 0, 0, 2, 100, 0, 30, 42, 0, 0, 0, 0],
};

// Named GM percussion patches. `percForNote()` maps drum notes to these.
export const PERCUSSION = {
  kick: [0, 190, 110, 180, 0, 0, 128, 0, 0, 0, 2, 18, 45, 210, 0, 0, 0, 0, 0, 0, 2, 90, 0, 0, 46, 0, 0, 0, 0],
  rimshot: [0, 120, 140, 40, 0, 0, 128, 0, 0, 150, 2, 4, 16, 190, 0, 0, 0, 0, 0, 0, 1, 180, 0, 0, 42, 0, 0, 0, 0],
  snare: [0, 110, 128, 50, 0, 0, 128, 0, 0, 210, 2, 10, 40, 130, 0, 0, 0, 0, 0, 0, 1, 150, 20, 0, 44, 0, 0, 0, 0],
  clap: [0, 0, 128, 0, 0, 0, 128, 0, 0, 220, 2, 6, 32, 95, 0, 0, 0, 0, 0, 0, 3, 150, 60, 0, 42, 0, 0, 0, 0],
  tomLow: [0, 170, 118, 120, 0, 0, 128, 0, 0, 10, 2, 14, 48, 150, 0, 0, 0, 0, 0, 0, 2, 100, 0, 0, 44, 0, 0, 0, 0],
  tomMid: [0, 170, 124, 120, 0, 0, 128, 0, 0, 10, 2, 13, 45, 150, 0, 0, 0, 0, 0, 0, 2, 105, 0, 0, 44, 0, 0, 0, 0],
  tomHigh: [0, 170, 130, 120, 0, 0, 128, 0, 0, 10, 2, 12, 42, 150, 0, 0, 0, 0, 0, 0, 2, 110, 0, 0, 44, 0, 0, 0, 0],
  hatClosed: [0, 0, 128, 0, 0, 0, 128, 0, 0, 200, 2, 3, 14, 70, 0, 0, 0, 0, 0, 0, 1, 200, 0, 0, 46, 0, 0, 0, 0],
  hatOpen: [0, 0, 128, 0, 0, 0, 128, 0, 0, 190, 2, 8, 48, 35, 0, 0, 0, 0, 0, 0, 1, 190, 0, 0, 44, 0, 0, 0, 0],
  crash: [0, 0, 128, 0, 0, 0, 128, 0, 0, 180, 3, 22, 98, 22, 0, 0, 0, 0, 0, 0, 1, 170, 0, 0, 42, 0, 0, 60, 80],
  ride: [0, 60, 150, 0, 0, 0, 128, 0, 0, 150, 2, 14, 62, 45, 0, 0, 0, 0, 0, 0, 1, 180, 0, 0, 42, 0, 0, 40, 70],
  tambourine: [0, 0, 128, 0, 0, 0, 128, 0, 0, 170, 2, 5, 28, 75, 0, 0, 0, 0, 0, 0, 1, 210, 30, 0, 42, 0, 0, 0, 0],
  cowbell: [1, 150, 150, 0, 1, 120, 157, 0, 0, 0, 2, 6, 26, 120, 0, 0, 0, 0, 0, 0, 2, 160, 0, 0, 44, 0, 0, 0, 0],
  shaker: [0, 0, 128, 0, 0, 0, 128, 0, 0, 160, 2, 3, 16, 85, 0, 0, 0, 0, 0, 0, 1, 220, 0, 0, 40, 0, 0, 0, 0],
  woodblock: [0, 140, 150, 40, 0, 0, 128, 0, 0, 40, 2, 4, 18, 170, 0, 0, 0, 0, 0, 0, 2, 170, 0, 0, 44, 0, 0, 0, 0],
  conga: [0, 165, 126, 90, 0, 0, 128, 0, 0, 20, 2, 10, 34, 150, 0, 0, 0, 0, 0, 0, 2, 120, 0, 0, 44, 0, 0, 0, 0],
  triangle: [0, 120, 170, 0, 0, 90, 182, 0, 0, 0, 2, 6, 85, 30, 0, 0, 0, 0, 0, 0, 2, 180, 0, 0, 38, 0, 0, 50, 80],
};

// GM percussion note number (35..81) -> PERCUSSION key.
const PERC_NOTE = {
  35: "kick", 36: "kick", 37: "rimshot", 38: "snare", 39: "clap", 40: "snare",
  41: "tomLow", 42: "hatClosed", 43: "tomLow", 44: "hatClosed", 45: "tomMid",
  46: "hatOpen", 47: "tomMid", 48: "tomHigh", 49: "crash", 50: "tomHigh",
  51: "ride", 52: "crash", 53: "ride", 54: "tambourine", 55: "crash",
  56: "cowbell", 57: "crash", 58: "tambourine", 59: "ride",
  60: "conga", 61: "conga", 62: "conga", 63: "conga", 64: "conga",
  65: "tomMid", 66: "tomLow", 67: "cowbell", 68: "cowbell",
  69: "shaker", 70: "shaker", 71: "shaker", 72: "shaker",
  73: "shaker", 74: "shaker", 75: "woodblock", 76: "woodblock", 77: "woodblock",
  78: "shaker", 79: "shaker", 80: "triangle", 81: "triangle",
};

// Nearest defined percussion key for any note number.
export function percForNote(note) {
  if (PERC_NOTE[note]) return PERC_NOTE[note];
  let best = "snare";
  let bestDist = Infinity;
  for (const k of Object.keys(PERC_NOTE)) {
    const d = Math.abs(+k - note);
    if (d < bestDist) {
      bestDist = d;
      best = PERC_NOTE[k];
    }
  }
  return best;
}

export function melodicForProgram(program) {
  const p = Math.max(0, Math.min(127, program | 0));
  return GM_FAMILY[p >> 3];
}

// Neutral default when a voice names no program.
export const DEFAULT_MELODIC = "piano";
