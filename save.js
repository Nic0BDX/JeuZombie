const key = 'cendres-du-marais-v1';
export let save = { gold:0, characters:1, weapons:3903, upgrades:[0,0,0,0], options:{ sound:true, musicVolume:.62, sfxVolume:.82, vibration:true, shake:true, quality:2 } };
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved) save = { ...save, ...saved, options:{ ...save.options, ...saved.options } };
} catch {}
save.weapons |= 3840;
export function persist() { try { localStorage.setItem(key, JSON.stringify(save)); } catch {} }
