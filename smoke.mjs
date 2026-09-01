// Node smoke test for the ABC -> SoundBox core. Asserts the emitted song is
// structurally valid, pitches map correctly, the instrument kit is valid and
// audible, and CPlayer renders without throwing. Run: npm run smoke

import * as abcjsNs from "abcjs";
const abcjs = abcjsNs.parseOnly ? abcjsNs : abcjsNs.default;
globalThis.ABCJS = abcjs;

const { abcToSong } = await import("./src/convert.js");
const { renderSong } = await import("./src/play.js");
const { MELODIC, PERCUSSION } = await import("./src/kit.js");

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

// %%MIDI program picks a GM family patch; a 5-note chord fans out to 2 tracks.
{
  const { song: s2, meta: m2 } = abcToSong(
    `X:1\nM:4/4\nL:1/4\n%%MIDI program 24\nK:C\n[CEGce]2 z2 |`,
  );
  ok(s2.songData.length === 2, "5-note chord -> 2 tracks");
  ok(
    JSON.stringify(s2.songData[0].i) === JSON.stringify(MELODIC.guitar) &&
      JSON.stringify(s2.songData[1].i) === JSON.stringify(MELODIC.guitar),
    "program 24 -> both fan-out tracks use the guitar family",
  );
  ok(/guitar/.test(m2.voiceMap["0:0"] || ""), "voiceMap names the resolved family");
  const pl = s2.patternLen;
  const t0 = s2.songData[0].c[0].n;
  const t1 = s2.songData[1].c[0].n;
  ok(
    t0[0] === 135 && t0[pl] === 139 && t0[2 * pl] === 142 && t0[3 * pl] === 147,
    "track 0 holds chord notes C E G c across columns 0..3",
  );
  ok(t1[0] === 151 && t1[pl] === 0, "track 1 holds the 5th note (e) in column 0",
  );
}

// Transpose: V: transpose= and %%MIDI transpose shift a melodic voice.
{
  const a = abcToSong(`X:1\nL:1/4\nK:C\nV:1 transpose=-12\nC2 z2 |`).song;
  ok(a.songData[0].c[0].n[0] === 123, "V: transpose=-12 shifts C4 (135) down to 123");
  const b = abcToSong(`X:1\nL:1/4\n%%MIDI transpose 7\nK:C\nC2 z2 |`).song;
  ok(b.songData[0].c[0].n[0] === 142, "%%MIDI transpose 7 shifts C4 (135) up to 142");
}

// Repeats: |: :| plays the section twice; identical bars share one c entry.
{
  const { song: r } = abcToSong(`X:1\nM:4/4\nL:1/4\nK:C\n|: CDEF :|`);
  ok(r.endPattern === 1, "|: CDEF :| spans two pattern slots");
  ok(r.songData[0].c.length === 1, "the two identical bars share one c entry");
  ok(JSON.stringify(r.songData[0].p) === "[1,1]", "p references pattern 1 twice");
}

// 1st/2nd endings: |: CD |1 EF :|2 GA | -> C D E F, then C D G A.
{
  const { song: e } = abcToSong(`X:1\nM:4/4\nL:1/4\nK:C\n|: CD |1 EF :|2 GA |`);
  const bar0 = e.songData[0].c[e.songData[0].p[0] - 1].n; // successive notes = successive rows
  const bar1 = e.songData[0].c[e.songData[0].p[1] - 1].n;
  ok(
    JSON.stringify(bar0.slice(0, 4)) === "[135,137,139,140]",
    "first pass bar holds C D E F",
  );
  ok(
    JSON.stringify(bar1.slice(0, 4)) === "[135,137,142,144]",
    "second pass bar holds C D G A (ending 1 skipped)",
  );
}

// A %%MIDI channel 10 voice routes each drum note to its own percussion track.
{
  const { song: s3, meta: m3 } = abcToSong(
    `X:1\nM:4/4\nL:1/8\n%%MIDI drummap F 36\n%%MIDI drummap G 38\n%%MIDI drummap A 42\nK:C\nV:1\n%%MIDI channel 10\nFA GA FA GA |`,
  );
  ok(s3.songData.length === 3, "drum voice -> 3 tracks (kick, snare, hat)");
  ok(/drums:/.test(m3.voiceMap["0:0"] || ""), "voiceMap marks the drum voice");
  const byPatch = (patch) =>
    s3.songData.find((t) => JSON.stringify(t.i) === JSON.stringify(patch));
  const kick = byPatch(PERCUSSION.kick);
  const snare = byPatch(PERCUSSION.snare);
  const hat = byPatch(PERCUSSION.hatClosed);
  ok(kick && snare && hat, "kick, snare and closed hat each got a track");
  const pl = s3.patternLen;
  ok(kick && kick.c[0].n[0] === 128 && kick.c[0].n[4] === 128, "kick on rows 0 and 4");
  ok(snare && snare.c[0].n[2] === 128 && snare.c[0].n[6] === 128, "snare on rows 2 and 6");
  ok(
    hat && [1, 3, 5, 7].every((r) => hat.c[0].n[r] === 128),
    "closed hat on the offbeat eighths",
  );
  ok(kick && kick.c[0].n.length === pl * 4, "drum n array is patternLen*4");
}

// Every kit patch: 29 params, FX_FREQ and FX_DRIVE non-zero, and audible when
// played as a single note.
const oneNoteSong = (i) => ({
  songData: [{ i, p: [1], c: [{ n: [147, 0, 0, 0, 0, 0, 0, 0], f: [] }] }],
  rowLen: 5000,
  patternLen: 2,
  endPattern: 0,
  numChannels: 1,
});
const allPatches = { ...MELODIC, ...PERCUSSION };
let kitFails = 0;
for (const [name, i] of Object.entries(allPatches)) {
  const badArray = !Array.isArray(i) || i.length !== 29 || !(i[21] > 0) || !(i[24] > 0);
  let peak = 0;
  if (!badArray) {
    // scan the whole ~10k-sample buffer from the start: percussion notes can be
    // shorter than 20 ms, so a late probe point would miss them entirely
    const s = renderSong(oneNoteSong(i)).getData(0.0005, 4900);
    peak = s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  }
  const good = !badArray && peak > 0.005;
  if (!good) kitFails++;
  console.log(
    `  ${good ? "ok  " : "FAIL"} kit ${name}` +
      (badArray ? " (bad array)" : ` peak ${peak.toFixed(3)}`),
  );
}
ok(kitFails === 0, `all ${Object.keys(allPatches).length} kit patches valid and audible`);

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
