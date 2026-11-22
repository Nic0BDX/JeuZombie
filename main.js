import { bindInput } from './input.js';
import { resize, update, render } from './game.js';

const canvas = document.querySelector('canvas');
const fps = document.querySelector('#fps');
const step = 1000 / 60;
let last = 0, rendered = 0, time = 0, samples = 0, draws = 0, report = 0, slow = false;

function fit() { resize(canvas); }
fit();
bindInput(canvas);
addEventListener('resize', fit);
window.visualViewport?.addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => {
  last = rendered = time = samples = draws = report = 0;
});

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  if (!last) last = report = now;
  time += Math.min(now - last, 100);
  last = now;
  samples++;
  while (time >= step) {
    update(1 / 60);
    time -= step;
  }
  if (!slow || now - rendered >= 32) {
    render();
    rendered = now;
    draws++;
  }
  const elapsed = now - report;
  if (elapsed < 1000) return;
  const refresh = samples * 1000 / elapsed;
  slow = refresh < (slow ? 56 : 50);
  fps.value = Math.round(draws * 1000 / elapsed) + ' FPS';
  report = now;
  samples = draws = 0;
}
requestAnimationFrame(frame);
