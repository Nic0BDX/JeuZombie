import { save } from './save.js';

let context, bus;
const voices = [
 [190,.1,'square'],[110,.09,'triangle'],[72,.14,'triangle'],[560,.08,'sine'],
 [520,.33,'triangle'],[310,.36,'sine'],[83,.21,'sawtooth'],[52,.5,'triangle']
];
let last=-1, pending=0;

export function sound(id) { pending|=1<<id; }
setInterval(()=>{
  const mask=pending;
  pending=0;
  if(!document.hidden) for(let id=7;id>=0;id--) if(mask & (1<<id)) playVoice(id);
},32);

export async function unlock() {
  try {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
      bus = context.createGain();
      bus.gain.value = .17;
      bus.connect(context.destination);
    }
    await context.resume();
  } catch {}
}

function playVoice(id) {
  if (!save.options.sound || context?.state !== 'running') return;
  const now = context.currentTime;
  if (now - last < .05 && id < 4) return;
  last = now;
  const [hz, duration, type] = voices[id];
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(hz, now);
  oscillator.frequency.exponentialRampToValueAtTime(hz * (id >= 3 && id <= 5 ? 1.8 : .46), now + duration);
  gain.gain.setValueAtTime(.26, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  oscillator.connect(gain);
  gain.connect(bus);
  oscillator.onended=()=>{ oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(now);
  oscillator.stop(now + duration);
}

export function vibrate(ms) {
  if (save.options.vibration) navigator.vibrate?.(ms);
}
