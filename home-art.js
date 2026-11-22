const shades=['#100e1c','#1c1423','#2d1b2e','#40243a','#542d45'];
export function drawHomeArt(canvas) {
  const c=canvas.getContext('2d'), w=360,h=380;
  canvas.width=w;canvas.height=h;
  let seed=10423;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function block(color,x,y,a,b) { c.fillStyle=color;c.fillRect(x,y,a,b); }
  function poly(color,xy) {
    c.fillStyle=color;c.beginPath();c.moveTo(xy[0],xy[1]);
    for(let i=2;i<xy.length;i+=2)c.lineTo(xy[i],xy[i+1]);
    c.closePath();c.fill();
  }
  const sky=c.createLinearGradient(0,0,0,h);
  sky.addColorStop(0,'#130f1d');sky.addColorStop(.62,'#642e44');sky.addColorStop(1,'#181320');
  block(sky,0,0,w,h);
  for(let i=0;i<125;i++) {
    const x=random()*w|0,y=random()*260|0;
    block(i%4?'#8e5a5938':'#f0a07872',x,y,i%4?1:2,1);
  }
  const mx=245,my=120,r=62;
  for(let y=-r;y<=r;y+=2) {
    const width=Math.floor(Math.sqrt(r*r-y*y));
    block(y>33?'#d05251':y>0?'#ea685f':'#f78371',mx-width,my+y,width*2,2);
  }
  for(let i=0;i<175;i++) {
    const x=(random()*124-62)|0,y=(random()*124-62)|0;
    if(x*x+y*y<3400)block(i%3?'#ac353b52':'#ffc08b65',mx+x,my+y,1+random()*7|0,1+random()*4|0);
  }
  for(let i=0;i<40;i++) {
    const y=70+i*5+(random()*16|0),x=random()*w|0;
    block(i%3?'#4e293e78':'#b6585b54',x,y,16+(random()*90|0),2+(random()*5|0));
  }
  for(let layer=0;layer<4;layer++) {
    const floor=247+layer*28;
    for(let i=0;i<11;i++) {
      const x=i*38-12+(random()*22|0),height=18+(random()*(70+layer*6)|0),y=floor-height;
      const color=shades[4-layer];
      if(i%4===0) {
        block(color,x,y,17,height);
        block(color,x-5,y+3,27,5);
        block(color,x+5,y-17,7,20);
        block(color,x+7,y-29,2,13);
        block('#e68165a0',x+5,y+18,3,7);
      } else {
        block(color,x+3,y,2,height);
        for(let j=1;j<5;j++) {
          const d=j*height/6|0,b=j*(2+layer)|0;
          poly(color,[x+4,y+d-9,x-b,y+d+8,x+b+8,y+d+7]);
        }
      }
    }
    poly(shades[4-layer],[0,floor-12,67,floor-5,105,floor+3,171,floor-4,217,floor+4,318,floor-8,360,floor-5,360,380,0,380]);
  }
  for(let i=0;i<80;i++) {
    const x=random()*360|0,y=273+(random()*105|0);
    block(['#b858532c','#dc805a35','#58435c99'][i%3],x,y,2+(random()*20|0),1);
  }
  for(let i=0;i<16;i++) {
    const x=19+i*22+(random()*15|0),y=288+(random()*44|0),s=3+(random()*4|0),color=shades[i%3];
    block(color,x,y,s,s+2);
    poly(color,[x-2,y+s,x+s+3,y+s,x+s+6,y+s*3,x-4,y+s*3]);
    block('#e35d5360',x+1,y+3,2,1);
  }
  poly('#0e0c17',[0,374,57,362,133,366,166,343,219,347,259,336,312,351,360,353,360,380,0,380]);
  poly('#402b3b',[146,357,168,344,208,345,235,343,250,349,216,351,188,351]);
  poly('#0a0912',[214,176,235,164,252,170,260,187,254,199,270,203,285,229,276,252,258,262,269,303,277,333,267,346,249,346,242,319,231,282,221,309,211,342,197,344,192,332,201,285,195,261,184,246,187,224,202,202,219,197]);
  poly('#322336',[214,177,234,166,250,173,255,186,248,196,221,194,211,186]);
  poly('#69505b',[219,179,232,171,244,174,252,182,233,181,221,187]);
  poly('#0c0b17',[226,184,246,183,251,191,241,201,223,194]);
  block('#df675e',239,189,6,2);block('#ffbd82',240,189,2,1);
  poly('#a33a3c',[216,198,251,197,255,206,242,217,221,211,205,213]);
  poly('#4e3040',[206,205,221,209,227,228,222,261,203,257,194,229]);
  poly('#663c47',[249,205,269,211,281,232,267,247,255,231,240,224]);
  poly('#8b5c55',[202,212,216,215,220,225,210,226,211,246,202,243,199,224]);
  poly('#443243',[226,221,240,219,258,245,253,261,221,259]);
  block('#b47757',231,254,14,4);block('#d19663',237,254,4,4);
  poly('#362837',[203,264,226,263,222,288,211,310,205,335,194,337,197,314]);
  poly('#453042',[233,265,253,264,258,296,271,332,259,339,246,318,239,294]);
  poly('#baa089',[264,244,274,238,305,275,303,285,293,280,264,255]);
  poly('#6e4f57',[273,249,301,278,305,279,302,286,276,264]);
  poly('#f07460',[213,175,222,171,215,178,215,190,211,187]);
  poly('#e26051',[268,211,278,220,283,230,277,226]);
  for(let i=0;i<68;i++) {
    const x=random()*w|0,y=random()*h|0;
    if(y>85 && (x<184 || x>280 || y>336))block(i%5?'#c5574e83':'#ffd189',x,y,i%3?1:2,i%4?1:2);
  }
}
