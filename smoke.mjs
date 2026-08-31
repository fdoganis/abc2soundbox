// Node smoke test for the ABC -> SoundBox core. Asserts the emitted song is
// structurally valid, pitches map correctly, and CPlayer renders it without
// throwing. Run: node tools/abc2soundbox/smoke.mjs

import * as abcjsNs from "abcjs";
const abcjs = abcjsNs.parseOnly ? abcjsNs : abcjsNs.default;
globalThis.ABCJS = abcjs;

const { abcToSong } = await import("./src/convert.js");
const { renderSong } = await import("./src/play.js");

let failures = 0;
const ok = (cond, msg) => {
  console.log((cond ? "  ok   " : "  FAIL ") + msg);
  if (!cond) failures++;
};

const ABC = `X:1
T:scale + chords
M:4/4
L:1/8
K:C
CDEF GABc | [CEG]4 [CFA]4 | cBAG FEDC | C8 |]`;

const { song, meta } = abcToSong(ABC);
console.log("meta:", JSON.stringify(meta));

ok(song.numChannels === song.songData.length, "numChannels === songData.length");
ok(Number.isInteger(song.endPattern) && song.endPattern >= 0, "endPattern is a non-negative int");
ok(song.rowLen > 0, "rowLen > 0");
ok(song.patternLen > 0, "patternLen > 0");

for (const [ti, tr] of song.songData.entries()) {
  ok(tr.i.length === 29, `track ${ti}: instrument has 29 params`);
  ok(tr.p.length === song.endPattern + 1, `track ${ti}: p covers every pattern slot`);
  ok(
    tr.p.every((x) => x === 0 || (x >= 1 && x <= tr.c.length)),
    `track ${ti}: p entries are 0 or a valid 1-based c index`,
  );
  for (const [ci, cell] of tr.c.entries()) {
    ok(
      cell.n.length === song.patternLen * 4,
      `track ${ti} pattern ${ci}: n length === patternLen*4`,
    );
    ok(
      cell.n.every((x) => x === 0 || (x > 75 && x < 75 + 128)),
      `track ${ti} pattern ${ci}: notes are 0 or MIDI+75`,
    );
  }
}

// Grid: eighths + quarters only -> eighth-note grid. A 4/4 bar is one whole note,
// so rowsPerWhole 8 and patternLen 8 (8 eighth-note rows per bar).
ok(meta.rowsPerWhole === 8, "derived grid is eighth-note (rowsPerWhole 8)");
ok(song.patternLen === 8, "patternLen 8 for a 4/4 bar at an eighth-note grid");

// Pitch: bar 1 is the C major scale C D E F G A B c = MIDI 60..71 -> SoundBox 135..146.
const bar1 = song.songData[0].c[0].n;
const line = [];
for (let r = 0; r < 8; r++) line.push(bar1[r]); // column 0, one eighth per row
ok(
  JSON.stringify(line) === JSON.stringify([135, 137, 139, 140, 142, 144, 146, 147]),
  "bar 1 column 0 == C major scale (SoundBox note numbers)",
);

// Bar 2 chord [CEG] -> columns 0,1,2 of row 0 hold C E G (135,139,142).
const bar2 = song.songData[0].c[1].n;
ok(
  bar2[0] === 135 && bar2[0 + song.patternLen] === 139 && bar2[0 + 2 * song.patternLen] === 142,
  "bar 2 chord [CEG] fills columns 0..2",
);

// CPlayer renders it, and the output is not silent.
try {
  const player = renderSong(song);
  ok(typeof player.createAudioBuffer === "function", "CPlayer rendered without throwing");
  const samples = player.getData(0.1, 8192); // interleaved L/R, range ~[-2,2]
  const peak = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
  ok(peak > 0.01, `rendered audio is audible (peak ${peak.toFixed(4)})`);
} catch (e) {
  ok(false, "CPlayer threw: " + e.message);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall green");
process.exit(failures ? 1 : 0);
