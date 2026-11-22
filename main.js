import { bindInput } from './input.js';
import { resize, update, render, background, reduceEffects, run } from './game.js';

import { startAccounts } from './online.js';
import { syncUi } from './ui.js';

const canvas = document.querySelector('canvas');
const fps = document.querySelector('#fps');
const step = 1000 / 60;
let lastMode='', dirty=true;
let last = 0, rendered = 0, time = 0, samples = 0, draws = 0, report = 0, slow = false;

function fit() { resize(canvas); dirty=true; }
fit();
bindInput(canvas);
syncUi();
startAccounts();
addEventListener('resize', fit);
window.visualViewport?.addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => {
  if(document.hidden) { background(); syncUi(); }
  last = rendered = time = samples = draws = report = 0;
});

addEventListener('pagehide', background);
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

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
  const interval=step*(slow ? 2 : 1);
  if((run.mode==='playing' || run.mode!==lastMode || dirty) && (!rendered || now-rendered >= interval-1)) {
    lastMode=run.mode;
    dirty=false;
    render();
    syncUi();
    rendered = rendered ? Math.max(now-interval,rendered+interval) : now;
    if(rendered>now+1) rendered=now;
    draws++;
  }
  const elapsed = now - report;
  if (elapsed < 1000) return;
  if(run.mode!=='playing') { report=now; samples=draws=0; return; }
  const refresh = samples * 1000 / elapsed;
  slow = refresh < (slow ? 56 : 50);
  reduceEffects(refresh < 45 || draws * 1000 / elapsed < 45 && !slow);
  fps.value = Math.round(draws * 1000 / elapsed) + ' FPS';
  report = now;
  samples = draws = 0;
}
requestAnimationFrame(frame);
