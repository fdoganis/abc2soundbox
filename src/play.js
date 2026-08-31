// Render a SoundBox song object to audio using the vendored CPlayer.
// renderSong() is pure (no DOM) so tests can call it in Node; playSong() adds
// the browser AudioContext playback.

import { CPlayer } from "./player-small.js";

export function renderSong(song) {
  const player = new CPlayer();
  player.init(song);
  while (player.generate() < 1) {
    /* generate() renders one channel per call; loop until every channel is done */
  }
  return player;
}

export async function playSong(song) {
  const player = renderSong(song);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = player.createAudioBuffer(ctx);
  src.connect(ctx.destination);
  src.start();
  return {
    stop() {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      ctx.close();
    },
  };
}
