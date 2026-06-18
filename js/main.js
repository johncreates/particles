import { ParticleEngine } from './particles.js';
import { initSettings } from './settings.js';

const canvas = document.getElementById('canvas');
const engine = new ParticleEngine(canvas);

// ─── Scene presets ────────────────────────────────────────────────────────
const PRESETS = {
  nebula: { gridShape: 'hex',    cloudSize: 'M', count: 280, particleSize: 2, reactivity: 25, idleEnergy: 25, depthStrength: 75 },
  void:   { gridShape: 'radial', cloudSize: 'S', count: 180, particleSize: 1, reactivity: 8,  idleEnergy: 3,  depthStrength: 90 },
  storm:  { gridShape: 'grid',   cloudSize: 'L', count: 600, particleSize: 2, reactivity: 85, idleEnergy: 55, depthStrength: 20 },
};

// ─── URL hash state ───────────────────────────────────────────────────────
function writeHash(config) {
  const p = new URLSearchParams();
  p.set('g', config.gridShape);
  p.set('s', config.cloudSize);
  p.set('n', config.count);
  p.set('p', config.particleSize);
  p.set('r', config.reactivity);
  p.set('i', config.idleEnergy);
  p.set('d', config.depthStrength);
  history.replaceState(null, '', '#' + p);
}

function parseHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const cfg = {};
  if (p.has('g')) cfg.gridShape     = p.get('g');
  if (p.has('s')) cfg.cloudSize     = p.get('s');
  if (p.has('n')) cfg.count         = Number(p.get('n'));
  if (p.has('p')) cfg.particleSize  = Number(p.get('p'));
  if (p.has('r')) cfg.reactivity    = Number(p.get('r'));
  if (p.has('i')) cfg.idleEnergy    = Number(p.get('i'));
  if (p.has('d')) cfg.depthStrength = Number(p.get('d'));
  return cfg;
}

// ─── Settings ────────────────────────────────────────────────────────────
const { syncUI } = initSettings((key, value) => {
  if (key === 'reroll') {
    engine.rerollBlob();
  } else if (key === 'preset') {
    engine.applyConfig(PRESETS[value]);
    syncUI(engine.config);
    writeHash(engine.config);
  } else {
    engine.setConfig(key, value);
    writeHash(engine.config);
  }
});

// Apply URL state on startup
const parsed = parseHash();
if (Object.keys(parsed).length > 0) {
  engine.applyConfig(parsed);
  syncUI(engine.config);
}
writeHash(engine.config);

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
  if (e.altKey) {
    engine.toggleWell(e.clientX, e.clientY, 'repulsor');
    return;
  }
  clickTimer = setTimeout(() => {
    engine.toggleWell(e.clientX, e.clientY, 'attractor');
    clickTimer = null;
  }, 220);
});
canvas.addEventListener('dblclick', e => {
  clearTimeout(clickTimer);
  clickTimer = null;
  engine.addShockwave(e.clientX, e.clientY);
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
