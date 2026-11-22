const keys = new Set();
const directions = ['KeyA', 'KeyQ', 'ArrowLeft', 'KeyD', 'ArrowRight', 'KeyW', 'KeyZ', 'ArrowUp', 'KeyS', 'ArrowDown'];
const radius = 48;
let pointer = null;
export const stick = { active: false, x: 0, y: 0, dx: 0, dy: 0 };
export const movement = { x: 0, y: 0 };

function move(event) {
  if (event.pointerId !== pointer) return;
  const x = event.clientX - stick.x;
  const y = event.clientY - stick.y;
  const distance = Math.hypot(x, y);
  const ratio = distance > radius ? radius / distance : 1;
  stick.dx = x * ratio;
  stick.dy = y * ratio;
}

function release() {
  pointer = null;
  stick.active = false;
  stick.dx = stick.dy = 0;
}

export function bindInput(canvas) {
  canvas.addEventListener('pointerdown', event => {
    if (pointer !== null || event.button !== 0 || event.clientY < canvas.clientHeight / 2) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = event.pointerId;
    stick.active = true;
    stick.x = event.clientX;
    stick.y = event.clientY;
  });
  canvas.addEventListener('pointermove', move);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => { if (pointer === event.pointerId) release(); });
  }
  addEventListener('keydown', event => {
    if (!directions.includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
  });
  addEventListener('keyup', event => keys.delete(event.code));
  addEventListener('contextmenu', event => event.preventDefault());
  addEventListener('blur', resetInput);
  document.addEventListener('visibilitychange', resetInput);
}

function resetInput() {
  release();
  keys.clear();
}

export function readInput() {
  let x = 0, y = 0;
  if (stick.active) {
    const squared = stick.dx ** 2 + stick.dy ** 2;
    if (squared > 36) {
      const length = Math.sqrt(squared);
      const gain = (length - 6) / ((radius - 6) * length);
      x = stick.dx * gain;
      y = stick.dy * gain;
    }
  } else {
    x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft'));
    y = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp'));
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  }
  movement.x = x;
  movement.y = y;
}
