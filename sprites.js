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

const recolor = (color, detail) => frames.map(frame => {
  const ctx=surface(16);
  ctx.drawImage(frame,0,0);
  ctx.globalCompositeOperation='source-atop';
  ctx.globalAlpha=.5;
  ctx.fillStyle=color;
  ctx.fillRect(0,0,16,16);
  ctx.globalAlpha=1;
  ctx.fillStyle=detail[0];ctx.fillRect(detail[1],detail[2],detail[3],detail[4]);
  return ctx.canvas;
});
const heroes={wanderer:frames,nettle:recolor('#74b892',['#bfdb9b',3,5,2,4]),ember:recolor('#d17a47',['#c39562',4,3,7,2]),herbalist:recolor('#8b65ab',['#b7e797',3,8,2,3]),fossil:recolor('#b7b2a1',['#e4d8a3',5,4,5,3])};
export function getSprite(name,frame) { return heroes[name][frame]; }

export const creatures=[];
export function buildCreatures(enemies) {
  for(let kind=0;kind<enemies.length;kind++) {
    const frames=[];
    const size=kind>=6 ? 32 : 16, s=size/16;
    for(let step=0;step<2;step++) for(let flash=0;flash<2;flash++) {
      const ctx=surface(size), color=enemies[kind].color;
      ctx.scale(s,s);
      const top=kind===1 || kind===4 ? 4 : 2;
      ctx.fillStyle='#17191e';
      ctx.fillRect(3,top+1,10,11-top);
      ctx.fillRect(4,12,3,3-step);
      ctx.fillRect(9,12,3,2+step);
      ctx.fillStyle=flash ? '#fff' : color;
      ctx.fillRect(4,top+2,8,10-top);
      ctx.fillRect(5,top,6,3);
      ctx.fillRect(2,7+step,3,kind===2 || kind>=5 ? 6 : 3);
      ctx.fillRect(11,8-step,3,kind===3 ? 5 : 3);
      if(kind>=5) { ctx.fillRect(3,0,2,4); ctx.fillRect(11,0,2,4); }
      ctx.fillStyle=flash ? '#e3d8c6' : '#2a252e';
      ctx.fillRect(6,top+3,1,2); ctx.fillRect(10,top+3,1,2);
      ctx.fillStyle='#ffe5a9';
      ctx.fillRect(7,top+3,1,1); ctx.fillRect(11,top+3,1,1);
      frames.push(ctx.canvas);
    }
    creatures.push(frames);
  }
}

const hound=surface(16);
hound.fillStyle='#577984';
hound.fillRect(3,7,10,5); hound.fillRect(11,5,4,5);
hound.fillStyle='#a4cfdc';
hound.fillRect(1,5,3,2); hound.fillRect(4,8,8,2);
hound.fillRect(11,4,1,3); hound.fillRect(13,3,1,4);
hound.fillRect(4,11,2,2); hound.fillRect(10,11,2,2);
hound.fillStyle='#e2fbf9';
hound.fillRect(13,7,1,1);
export const ghostHound=hound.canvas;

export const terrainVariants=[tiles];
for(const color of ['#425c4d','#523d51']) {
  terrainVariants.push(tiles.map(tile=>{
    const ctx=surface(32);
    ctx.drawImage(tile,0,0);
    ctx.globalCompositeOperation='source-atop';
    ctx.globalAlpha=.26; ctx.fillStyle=color; ctx.fillRect(0,0,32,32);
    return ctx.canvas;
  }));
}
