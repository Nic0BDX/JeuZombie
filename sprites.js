function surface(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas.getContext('2d');
}

const palette = ['transparent','#202129','#51415b','#886887','#e2ae7d','#7cc4ae','#c9f3cb'];
const body = [
  '0000000000000000','0000011100000000','0000123310000000','0001233331000000',
  '0001234411000000','0001234456100000','0001233155100000','0001223331000000',
  '0001223323100000','0012223323100000','0012223322100000','0011222221100000',
  '0001111111000000'
];
const frames = [];
for (let frame = 0; frame < 4; frame++) {
  const ctx = surface(16);
  for (let y = 0; y < body.length; y++) {
    for (let x = 0; x < 16; x++) {
      const color = Number(body[y][x]);
      if (!color) continue;
      ctx.fillStyle = palette[color];
      ctx.fillRect(x, y - (frame % 2), 1, 1);
    }
  }
  ctx.fillStyle = palette[1];
  ctx.fillRect(frame === 1 ? 4 : 5, 12, 3, frame === 3 ? 2 : 3);
  ctx.fillRect(frame === 3 ? 9 : 8, 12, 3, frame === 1 ? 2 : 3);
  frames.push(ctx.canvas);
}
export function getSprite(name, frame) {
  return name === 'wanderer' ? frames[frame] : null;
}

export const tiles = [];
export function tileHash(x, y) {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return (hash ^ (hash >>> 16)) >>> 0;
}

for (let i = 0; i < 16; i++) {
  const ctx = surface(32);
  ctx.fillStyle = '#292f2e';
  ctx.fillRect(0, 0, 32, 32);
  for (let j = 0; j < 29; j++) {
    const seed = tileHash(i + 2, j + 1);
    ctx.fillStyle = j % 3 ? '#303934' : '#222829';
    ctx.fillRect(seed % 29, (seed >>> 8) % 30, 2 + (j % 2), 1);
  }
  if (i < 7) {
    ctx.fillStyle = '#394340';
    ctx.fillRect(12, 19, 5, 3);
    ctx.fillStyle = i < 3 ? '#775970' : '#53625b';
    ctx.fillRect(13, 18, 3, 2);
    ctx.fillRect(23, 8, 2, 1);
  }
  tiles.push(ctx.canvas);
}
