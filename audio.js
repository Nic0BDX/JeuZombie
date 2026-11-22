import { save } from './save.js';
import { effects, musicNotes, soundIds, tracks } from './data/audio.js';

export { soundIds };

const voiceCap = 16, stepCount = 16, lookahead = .12;
const voices = Array.from({ length: voiceCap }, () =>
  ({ source: null, filter: null, envelope: null, priority: 0, ends: 0 }));
const effectOrder = effects.map((_, id) => id).sort((a, b) => effects[b][0] - effects[a][0]);
const lastPlayed = new Float64Array(effects.length).fill(-Infinity);
const musicLanes = [null, null];
let context, master, music, sfx, noise, timer, switching;
let pending = 0, mode = 'menu', desired = tracks.menu, current = null;
let lane = 0, nextStep = 0, step = 0, bar = 0, gemChain = 0;
let musicGain = -1, sfxGain = -1, duck = false;

export function sound(id) { if (id >= 0 && id < effects.length) pending |= 1 << id; }
export function vibrate(ms) { if (save.options.vibration) navigator.vibrate?.(ms); }

function init() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  context = new Audio();
  context.addEventListener('statechange', restoreScheduler);
  master = context.createGain();
  music = context.createGain();
  sfx = context.createGain();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 5;
  limiter.ratio.value = 16;
  limiter.attack.value = .003;
  limiter.release.value = .14;
  master.gain.value = .72;
  music.gain.value = sfx.gain.value = 0;
  music.connect(master);
  sfx.connect(master);
  master.connect(limiter);
  limiter.connect(context.destination);
  for (let i = 0; i < 2; i++) {
    const channel = musicLanes[i] = context.createGain();
    channel.gain.value = 0;
    channel.connect(music);
  }
  for (let i = 0; i < voiceCap; i++) voices[i].envelope = context.createGain();
  noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  setAudioVolumes();
}

function toGain(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

export function setAudioVolumes() {
  if (!context || !music) return;
  const enabled = save.options.sound !== false;
  const nextMusic = enabled ? toGain(save.options.musicVolume, .62) * (duck ? .6 : 1) : 0;
  const nextSfx = enabled ? toGain(save.options.sfxVolume, .82) : 0;
  const now = context.currentTime;
  if (musicGain !== nextMusic) {
    music.gain.setTargetAtTime(nextMusic, now, .065);
    musicGain = nextMusic;
  }
  if (sfxGain !== nextSfx) {
    sfx.gain.setTargetAtTime(nextSfx, now, .028);
    sfxGain = nextSfx;
  }
}

function shouldPlay() { return mode !== 'pause' && !document.hidden; }

export async function unlock() {
  try {
    if (!context) init();
    if (!context || document.hidden) return;
    await context.resume();
    alignContext();
  } catch {}
}

function restoreScheduler() {
  if (shouldPlay() && context.state === 'running' && timer === undefined) pump();
}

function alignContext() {
  if (!context || switching) return;
  if (shouldPlay() && context.state === 'running') {
    if (timer === undefined) pump();
    return;
  }
  if (!shouldPlay()) {
    clearTimeout(timer);
    timer = undefined;
    nextStep = 0;
    pending = 0;
    gemChain = 0;
    for (let i = 0; i < voiceCap; i++) release(voices[i], true);
    if (context.state === 'suspended') return;
  }
  const play = shouldPlay();
  switching = (play ? context.resume() : context.suspend())
    .then(() => {
      switching = undefined;
      if (play !== shouldPlay()) alignContext();
      else if (play && context.state === 'running' && timer === undefined) pump();
    })
    .catch(() => { switching = undefined; });
}

export function syncAudio(nextMode, elapsed, enemyCount, boss) {
  const changed = mode !== nextMode;
  mode = nextMode;
  const nextDuck = mode === 'level' || (mode === 'playing' && boss);
  if (nextDuck !== duck) {
    duck = nextDuck;
    setAudioVolumes();
  }
  if (mode === 'menu') desired = tracks.menu;
  else if (mode === 'won') desired = tracks.victory;
  else if (mode === 'lost') desired = tracks.defeat;
  else if (mode !== 'pause') {
    if (boss) desired = tracks.boss;
    else if (elapsed >= 300 || enemyCount >= 90) desired = tracks.flood;
    else if (elapsed >= 120 || enemyCount >= 40) desired = tracks.active;
    else desired = tracks.quiet;
  }
  if (changed) alignContext();
}

document.addEventListener('visibilitychange', alignContext);

function release(voice, stop) {
  const source = voice.source;
  if (!source) return;
  source.onended = null;
  source.disconnect();
  voice.filter?.disconnect();
  voice.envelope.disconnect();
  if (stop) source.stop();
  voice.source = voice.filter = null;
}

function getVoice(priority) {
  let candidate = null;
  for (let i = 0; i < voiceCap; i++) {
    const voice = voices[i];
    if (!voice.source) return voice;
    if (voice.priority < priority && (!candidate || voice.priority < candidate.priority ||
      (voice.priority === candidate.priority && voice.ends < candidate.ends))) candidate = voice;
  }
  if (candidate) release(candidate, true);
  return candidate;
}

function playNote(note, at, pitch, bus, priority, duration = note.duration) {
  const voice = getVoice(priority);
  if (!voice) return;
  const noiseNote = note.shape === 'bandpass' || note.shape === 'lowpass' || note.shape === 'highpass';
  const source = noiseNote ? context.createBufferSource() : context.createOscillator();
  const start = at + note.delay;
  const end = start + duration;
  const attack = Math.min(note.attack, duration * .25);
  const decay = start + attack + duration * .20;
  const releaseAt = end - duration * .35;
  let frequency;
  if (noiseNote) {
    const filter = voice.filter = context.createBiquadFilter();
    filter.type = note.shape;
    filter.Q.value = note.shape === 'bandpass' ? 1.3 : .7;
    source.buffer = noise;
    source.loop = true;
    source.connect(filter);
    filter.connect(voice.envelope);
    frequency = filter.frequency;
  } else {
    source.type = note.shape;
    source.connect(voice.envelope);
    frequency = source.frequency;
  }
  frequency.setValueAtTime(note.hz * pitch, start);
  frequency.exponentialRampToValueAtTime(note.end * pitch, end);
  const amp = voice.envelope.gain;
  amp.cancelScheduledValues(context.currentTime);
  amp.setValueAtTime(.0001, context.currentTime);
  amp.setValueAtTime(.0001, start);
  amp.exponentialRampToValueAtTime(note.gain, start + attack);
  amp.exponentialRampToValueAtTime(note.gain * .47, decay);
  amp.setValueAtTime(note.gain * .47, releaseAt);
  amp.exponentialRampToValueAtTime(.0001, end);
  voice.envelope.connect(bus);
  voice.source = source;
  voice.priority = priority;
  voice.ends = end;
  source.onended = () => { if (voice.source === source) release(voice, false); };
  if (noiseNote) source.start(start, Math.random() * .8);
  else source.start(start);
  source.stop(end + .005);
}

function playPending(now) {
  const mask = pending;
  pending = 0;
  if (sfxGain <= 0) return;
  for (let n = 0; n < effectOrder.length; n++) {
    const id = effectOrder[n];
    if (!(mask & (1 << id))) continue;
    const since = now - lastPlayed[id];
    if (since < .05) continue;
    lastPlayed[id] = now;
    let pitch = .94 + Math.random() * .12;
    if (id === soundIds.gem) {
      gemChain = since < .42 ? Math.min(7, gemChain + 1) : 0;
      pitch *= 2 ** (gemChain / 12);
    }
    const effect = effects[id];
    for (let i = 1; i < effect.length; i++) playNote(effect[i], now + .004, pitch, sfx, effect[0]);
  }
}

function hz(midi) { return 440 * 2 ** ((midi - 69) / 12); }

function switchTrack(at) {
  if (current) {
    musicLanes[lane].gain.setTargetAtTime(0, at, .075);
    lane ^= 1;
  }
  current = desired;
  bar = 0;
  musicLanes[lane].gain.setTargetAtTime(current.gain, at, .045);
}

function queueMusic(at) {
  if (!current || (!step && current !== desired)) switchTrack(at);
  if (musicGain <= 0) return;
  const track = current;
  const root = track.root + track.chords[bar % track.chords.length];
  const bus = musicLanes[lane];
  if (track.bass.includes(step)) {
    const length = step === 0 && track.bass.length === 1 ? 180 / track.bpm : 45 / track.bpm;
    playNote(musicNotes.bass, at, hz(root), bus, 2, length);
  }
  const arp = track.arp[step];
  if (arp !== null) playNote(musicNotes.arp, at, hz(root + 24 + arp), bus, 1);
  if (track.drums) {
    if (!step || step === 8 || (track.drums === 2 && step === 11)) playNote(musicNotes.kick, at, 1, bus, 1);
    if (step === 4 || step === 12) playNote(musicNotes.snare, at, 1, bus, 1);
    if (step % (track.drums === 2 ? 2 : 4) === 2) playNote(musicNotes.hat, at, 1, bus, 0);
  }
  if (track.lead && bar % 2 === 1 && (step === 3 || step === 10)) {
    const lead = track.lead[(bar + (step === 10 ? 1 : 0)) % track.lead.length];
    playNote(musicNotes.lead, at, hz(root + 24 + lead), bus, 1);
  }
}

function pump() {
  timer = undefined;
  if (!shouldPlay() || context.state !== 'running') return;
  const now = context.currentTime;
  playPending(now);
  if (nextStep < now) nextStep = now + .025;
  while (nextStep < now + lookahead) {
    queueMusic(nextStep);
    nextStep += 15 / current.bpm;
    step = (step + 1) % stepCount;
    if (!step) bar++;
  }
  timer = setTimeout(pump, 25);
}
