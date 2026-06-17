import { ParticleEngine } from './particles.js';
import { initSettings } from './settings.js';

const canvas = document.getElementById('canvas');
const engine = new ParticleEngine(canvas);

// ─── Mouse tracking ──────────────────────────────────────────────────────
canvas.addEventListener('mousemove', e => {
  engine.mouse.x = e.clientX;
  engine.mouse.y = e.clientY;
});
canvas.addEventListener('mousedown', () => { engine.mouse.down = true; });
canvas.addEventListener('mouseup', () => { engine.mouse.down = false; });
canvas.addEventListener('mouseleave', () => {
  engine.mouse.x = -9999;
  engine.mouse.y = -9999;
  engine.mouse.down = false;
});

// Touch support
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t = e.touches[0];
  engine.mouse.x = t.clientX;
  engine.mouse.y = t.clientY;
}, { passive: false });
canvas.addEventListener('touchstart', e => {
  engine.mouse.down = true;
  const t = e.touches[0];
  engine.mouse.x = t.clientX;
  engine.mouse.y = t.clientY;
}, { passive: true });
canvas.addEventListener('touchend', () => {
  engine.mouse.down = false;
  engine.mouse.x = -9999;
  engine.mouse.y = -9999;
});

// ─── Gravity wells + shockwave ───────────────────────────────────────────
let clickTimer = null;
canvas.addEventListener('click', e => {
  if (e.shiftKey) {
    engine.addHotParticle(e.clientX, e.clientY);
    return;
  }
  clickTimer = setTimeout(() => {
    engine.toggleWell(e.clientX, e.clientY);
    clickTimer = null;
  }, 220);
});
canvas.addEventListener('dblclick', e => {
  clearTimeout(clickTimer);
  clickTimer = null;
  engine.addShockwave(e.clientX, e.clientY);
});

// ─── Settings ────────────────────────────────────────────────────────────
initSettings((key, value) => {
  if (key === 'reroll') {
    engine.rerollBlob();
  } else {
    engine.setConfig(key, value);
  }
});

// ─── Animation loop ───────────────────────────────────────────────────────
let last = null;
function loop(ts) {
  const dt = last === null ? 0.016 : Math.min((ts - last) / 1000, 0.05);
  last = ts;
  engine.tick(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
