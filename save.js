const key = 'cendres-du-marais-v1';
export let save = { gold:0, characters:1, weapons:63, upgrades:[0,0,0,0], options:{ sound:true, vibration:true, shake:true, quality:2 } };
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved) save = { ...save, ...saved, options:{ ...save.options, ...saved.options } };
} catch {}
export function persist() { try { localStorage.setItem(key, JSON.stringify(save)); } catch {} }
