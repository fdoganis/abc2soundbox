// Placeholder SoundBox instruments (29-param `i` arrays), used as the fallback
// when the sidecar JSON does not name an instrument for a voice. A curated GM-ish
// kit replaces these values in a later pass; the pipeline only needs valid arrays.
//
// Index reference: 0 osc1 wave, 1 osc1 vol, 2 osc1 semi, 3 osc1 xenv,
// 4 osc2 wave, 5 osc2 vol, 6 osc2 semi, 7 osc2 detune, 8 osc2 xenv, 9 noise vol,
// 10 attack, 11 sustain, 12 release, 13 exp decay, 14 arp chord, 15 arp speed,
// 16 lfo wave, 17 lfo amt, 18 lfo freq, 19 lfo fx-freq, 20 fx filter,
// 21 fx freq, 22 fx resonance, 23 fx dist, 24 fx drive, 25 pan amt,
// 26 pan freq, 27 delay amt, 28 delay time.
//
// Both fx freq (21) and fx drive (24) MUST be non-zero: the player always runs
// the state-variable filter and multiplies by drive, so a zero in either field
// silences the track.

export const KIT = {
  // saw + triangle, slow attack, wide-open filter — a soft sustained voice.
  pad: [2, 160, 128, 0, 3, 120, 128, 0, 0, 0, 20, 60, 80, 0, 0, 0, 0, 0, 0, 0, 2, 120, 0, 0, 32, 0, 0, 0, 0],
  // square, one octave down, short pluck envelope.
  bass: [1, 192, 116, 0, 1, 0, 116, 0, 0, 0, 2, 30, 40, 20, 0, 0, 0, 0, 0, 0, 2, 90, 0, 0, 32, 0, 0, 0, 0],
  // saw, instant attack, medium decay — a plain melodic lead.
  lead: [2, 192, 128, 0, 2, 0, 128, 0, 0, 0, 2, 44, 50, 0, 0, 0, 0, 0, 0, 0, 2, 128, 0, 0, 32, 0, 0, 0, 0],
};
