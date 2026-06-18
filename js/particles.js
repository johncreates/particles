// Particle field engine — all coordinates in CSS pixels

export class ParticleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.wells = [];       // { x, y }  max 5
    this.shockwaves = [];  // { x, y, t, duration, maxR }
    this.galaxyDust = [];  // ephemeral dust particles tied to galaxy wells
    this.time = 0;
    this.mouse = { x: -9999, y: -9999, down: false };

    this.config = {
      count: 400,
      particleSize: 2,
      reactivity: 50,
      idleEnergy: 5,
      cloudSize: 'S',
      depthStrength: 50,
      gridShape: 'grid',
    };

    // Default wave: left-to-right
    this._wave = { kX: 0.6, kY: 0.0, sX: 1.2, sY: 0.0 };

    // Rare slow gravitational tides
    this._tides = [];
    this._nextTideAt = 20;

    // Comets
    this.comets = [];
    this._nextCometAt = 45 + Math.random() * 75;

    // Background star field
    this.bgStars = [];

    // Nebula gas clouds
    this.nebulae = [];

    // Supernova effects
    this.sparks = [];
    this.flashes = [];

    // Emergent constellations
    this.constellations = [];
    this._nextConstellationAt = 12;

    // Attract / idle mode
    this._idleTime = 0;
    this._attractWellAt = 0;

    this._resize();
    this.spawnParticles();

    this._onResize = this._resize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  get _dpr() { return window.devicePixelRatio || 1; }
  get _W() { return window.innerWidth; }
  get _H() { return window.innerHeight; }

  // ─── Grid geometry ────────────────────────────────────────────────────────
  _gridParams() {
    const W = this._W, H = this._H;
    const marginFrac = { S: 0.25, M: 0.15, L: 0.07, XL: 0.02 }[this.config.cloudSize] ?? 0.15;
    const marginX = W * marginFrac;
    const marginY = H * marginFrac;
    const gridW = W - 2 * marginX;
    const gridH = H - 2 * marginY;
    const cols = Math.max(2, Math.round(Math.sqrt(this.config.count * (gridW / gridH))));
    const rows = Math.max(2, Math.round(this.config.count / cols));
    const spacingX = gridW / Math.max(cols - 1, 1);
    const spacingY = gridH / Math.max(rows - 1, 1);
    return { cols, rows, spacingX, spacingY, marginX, marginY };
  }

  _hexLayoutParams() {
    const W = this._W, H = this._H;
    const marginFrac = { S: 0.25, M: 0.15, L: 0.07, XL: 0.02 }[this.config.cloudSize] ?? 0.15;
    const marginX = W * marginFrac, marginY = H * marginFrac;
    const gridW = W - 2 * marginX, gridH = H - 2 * marginY;
    const cx = W / 2, cy = H / 2;
    // Flat-top hexagon (wider than tall) with apothem `a`, fit within the area
    const a = Math.min(gridH / 2, gridW * Math.sqrt(3) / 4);
    const halfW = 2 * a / Math.sqrt(3);              // centre → left/right vertex
    // Spacing derived from hexagon area so particle count stays ~constant
    const hexArea = 2 * Math.sqrt(3) * a * a;
    const hexSpacing = Math.sqrt(hexArea * 2 / (this.config.count * Math.sqrt(3)));
    const hexSpacingY = hexSpacing * Math.sqrt(3) / 2;
    // Lattice big enough to cover the hexagon's bounding box (+pad for filtering)
    const cols = Math.max(2, Math.round((2 * halfW) / hexSpacing) + 2);
    const rows = Math.max(2, Math.round((2 * a) / hexSpacingY) + 2);
    return { cols, rows, hexSpacing, hexSpacingY, cx, cy, a, halfW };
  }

  // Flat-top hexagon membership test (apothem a, centred at cx,cy)
  _inHex(px, py, cx, cy, a) {
    const X = Math.abs(px - cx), Y = Math.abs(py - cy);
    if (Y > a + 0.5) return false;
    return (Math.sqrt(3) / 2) * X + 0.5 * Y <= a + 0.5;
  }

  _radialLayoutParams() {
    const W = this._W, H = this._H;
    const marginFrac = { S: 0.25, M: 0.15, L: 0.07, XL: 0.02 }[this.config.cloudSize] ?? 0.15;
    const marginX = W * marginFrac, marginY = H * marginFrac;
    const gridW = W - 2 * marginX, gridH = H - 2 * marginY;
    const cx = W / 2, cy = H / 2;
    const maxRadius = Math.min(gridW, gridH) / 2;
    let N = 1;
    while (1 + 3 * N * (N + 1) < this.config.count) N++;
    const radialSpacing = maxRadius / N;
    return { N, radialSpacing, cx, cy, maxRadius };
  }

  // ─── Spawn particles ──────────────────────────────────────────────────────
  spawnParticles() {
    this.particles = [];
    const shape = this.config.gridShape;
    if (shape === 'hex') this._spawnHex();
    else if (shape === 'radial') this._spawnRadial();
    else this._spawnGrid();
  }

  _spawnGrid() {
    const { cols, rows, spacingX, spacingY, marginX, marginY } = this._gridParams();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = marginX + col * spacingX;
        const y = marginY + row * spacingY;
        this.particles.push({
          x, y, homeX: x, homeY: y,
          col, row,
          vx: 0, vy: 0,
          phaseX: Math.random() * Math.PI * 2,
          phaseY: Math.random() * Math.PI * 2,
          size: this.config.particleSize,
          hot: Math.random() < 0.025,
        });
      }
    }
  }

  _spawnHex() {
    const { cols, rows, hexSpacing, hexSpacingY, cx, cy, a } = this._hexLayoutParams();
    const startX = cx - ((cols - 1) * hexSpacing) / 2;
    const startY = cy - ((rows - 1) * hexSpacingY) / 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * hexSpacing + (row % 2) * hexSpacing / 2;
        const y = startY + row * hexSpacingY;
        if (!this._inHex(x, y, cx, cy, a)) continue;
        this.particles.push({
          x, y, homeX: x, homeY: y,
          col, row,
          vx: 0, vy: 0,
          phaseX: Math.random() * Math.PI * 2,
          phaseY: Math.random() * Math.PI * 2,
          size: this.config.particleSize,
          hot: Math.random() < 0.025,
        });
      }
    }
  }

  _spawnRadial() {
    const { N, radialSpacing, cx, cy } = this._radialLayoutParams();
    this.particles.push({
      x: cx, y: cy, homeX: cx, homeY: cy,
      ring: 0, angleIdx: 0, col: 0, row: 0,
      vx: 0, vy: 0,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      size: this.config.particleSize,
      hot: Math.random() < 0.025,
    });
    for (let ring = 1; ring <= N; ring++) {
      const numInRing = 6 * ring;
      const radius = ring * radialSpacing;
      for (let i = 0; i < numInRing; i++) {
        const angle = (2 * Math.PI / numInRing) * i;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        this.particles.push({
          x, y, homeX: x, homeY: y,
          ring, angleIdx: i, col: ring, row: 0,
          vx: 0, vy: 0,
          phaseX: Math.random() * Math.PI * 2,
          phaseY: Math.random() * Math.PI * 2,
          size: this.config.particleSize,
          hot: Math.random() < 0.025,
        });
      }
    }
  }

  // ─── Recompute home positions (resize / grid size change) ─────────────────
  _rehome() {
    const shape = this.config.gridShape;
    if (shape === 'hex') {
      const { cols, rows, hexSpacing, hexSpacingY, cx, cy } = this._hexLayoutParams();
      const startX = cx - ((cols - 1) * hexSpacing) / 2;
      const startY = cy - ((rows - 1) * hexSpacingY) / 2;
      for (const p of this.particles) {
        if (p.hot) continue;
        p.homeX = startX + p.col * hexSpacing + (p.row % 2) * hexSpacing / 2;
        p.homeY = startY + p.row * hexSpacingY;
        p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
      }
    } else if (shape === 'radial') {
      const { N, radialSpacing, cx, cy } = this._radialLayoutParams();
      for (const p of this.particles) {
        if (p.hot) continue;
        if (p.ring === 0) {
          p.homeX = cx; p.homeY = cy;
        } else {
          const numInRing = 6 * p.ring;
          const radius = p.ring * radialSpacing;
          const angle = (2 * Math.PI / numInRing) * p.angleIdx;
          p.homeX = cx + Math.cos(angle) * radius;
          p.homeY = cy + Math.sin(angle) * radius;
        }
        p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
      }
    } else {
      const { spacingX, spacingY, marginX, marginY } = this._gridParams();
      for (const p of this.particles) {
        if (p.hot) continue;
        p.homeX = marginX + p.col * spacingX;
        p.homeY = marginY + p.row * spacingY;
        p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
      }
    }
  }

  _spawnBgStars() {
    const W = this._W, H = this._H;
    this.bgStars = Array.from({ length: 80 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 0.4 + Math.random() * 0.5,
      alpha: 0.10 + Math.random() * 0.24,
    }));
  }

  _spawnNebulae() {
    const W = this._W, H = this._H;
    const palette = [[120, 60, 180], [40, 90, 170], [150, 50, 120], [40, 120, 140]]; // violet/indigo/magenta/teal
    this.nebulae = Array.from({ length: 4 }, () => {
      const c = palette[Math.floor(Math.random() * palette.length)];
      return {
        x: Math.random() * W, y: Math.random() * H,
        r: Math.min(W, H) * (0.35 + Math.random() * 0.35),
        cr: c[0], cg: c[1], cb: c[2],
        maxA: 0.05 + Math.random() * 0.05,
        driftSpeed: 2 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
      };
    });
  }

  // ─── Canvas resize ────────────────────────────────────────────────────────
  _resize() {
    const dpr = this._dpr;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._spawnBgStars();
    this._spawnNebulae();
    if (this.particles.length) this._rehome();
  }

  // ─── Gravitational lensing — displace a point around wells ────────────────
  _lensPoint(x, y) {
    let dx = 0, dy = 0;
    for (const w of this.wells) {
      const rx = x - w.x, ry = y - w.y;
      const d = Math.hypot(rx, ry) || 0.001;
      const mass = 1 + 0.5 * Math.max(0, (w.lifespan - 10) / 50);
      const reach = 200 * mass;
      if (d > reach) continue;
      const fade = 1 - d / reach;
      const deflect = (mass * 1600) / (d + 50);
      const sign = w.type === 'repulsor' ? -1 : 1;
      dx += (rx / d) * deflect * fade * fade * sign;
      dy += (ry / d) * deflect * fade * fade * sign;
    }
    return [x + dx, y + dy];
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  setConfig(key, value) {
    this.config[key] = value;
    if (key === 'cloudSize' || key === 'gridShape') {
      this.spawnParticles();
    } else if (key === 'count') {
      this.spawnParticles();
    } else if (key === 'particleSize') {
      for (const p of this.particles) p.size = value;
    }
  }

  rerollBlob() {
    const dirs = [
      { kX: 0.6, kY: 0.0,  sX: 1.2, sY: 0.0  }, // left-to-right
      { kX: 0.0, kY: 0.6,  sX: 0.0, sY: 1.2  }, // top-to-bottom
      { kX: 0.5, kY: 0.5,  sX: 1.0, sY: 1.0  }, // diagonal ↘
      { kX: 0.5, kY: -0.5, sX: 1.0, sY: -1.0 }, // diagonal ↗
      { kX: 0.7, kY: 0.25, sX: 1.1, sY: 0.4  }, // oblique
    ];
    this._wave = dirs[Math.floor(Math.random() * dirs.length)];
  }

  toggleWell(x, y, type = 'attractor') {
    const hitIdx = this.wells.findIndex(w => Math.hypot(w.x - x, w.y - y) < 28);
    if (hitIdx !== -1) {
      const removed = this.wells.splice(hitIdx, 1)[0];
      this.galaxyDust = this.galaxyDust.filter(d => d.wellId !== removed.id);
    } else if (this.wells.length < 5) {
      const wellId = Date.now() + Math.random();
      const lifespan = 10 + Math.random() * 50;
      this.wells.push({
        x, y, age: 0,
        lifespan,
        type,
        spin: Math.random() < 0.5 ? 1 : -1,
        id: wellId,
        tiltAngle: Math.random() * Math.PI * 2,
        tiltSpeed: (0.12 + Math.random() * 0.25) * (Math.random() < 0.5 ? 1 : -1),
        vx: 0, vy: 0,
      });
      if (type === 'attractor') {
        const galaxyScale = 1 + 0.6 * Math.max(0, (lifespan - 10) / 50);
        for (let i = 0; i < 50; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (4 + Math.random() * 5) * galaxyScale;
          this.galaxyDust.push({
            x: x + (Math.random() - 0.5) * 8 * galaxyScale,
            y: y + (Math.random() - 0.5) * 8 * galaxyScale,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            wellId,
            size: 0.6 + Math.random() * 0.7,
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
          });
        }
      }
    }
  }

  applyConfig(cfg) {
    Object.assign(this.config, cfg);
    this.spawnParticles();
  }

  noteInteraction() {
    this._idleTime = 0;
  }

  exportPNG() {
    const tmp = document.createElement('canvas');
    tmp.width = this.canvas.width;
    tmp.height = this.canvas.height;
    const tctx = tmp.getContext('2d');
    tctx.fillStyle = '#0e0d0c';
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(this.canvas, 0, 0);
    const a = document.createElement('a');
    a.href = tmp.toDataURL('image/png');
    a.download = `cosmos-${Date.now()}.png`;
    a.click();
  }

  addShockwave(x, y) {
    const maxR = Math.max(this._W, this._H) * 0.75;
    this.shockwaves.push({ x, y, t: 0, duration: 1.8, maxR, strength: 1.0 });
  }

  addHotParticle(x, y) {
    const hotCount = this.particles.filter(p => p.hot).length;
    if (hotCount >= 20) return;
    this.particles.push({
      x, y,
      homeX: x, homeY: y,
      col: 0, row: 0,
      vx: 0, vy: 0,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      size: this.config.particleSize,
      hot: true,
    });
  }

  // ─── Main update + draw ───────────────────────────────────────────────────
  tick(dt) {
    this.time += dt;
    const { ctx } = this;
    const W = this._W;
    const H = this._H;

    ctx.clearRect(0, 0, W, H);

    const idleStrength = (this.config.idleEnergy / 100) * 0.06;
    const reactivity = (this.config.reactivity / 100) * 5000;
    const influenceR = Math.min(W, H) * 0.18;
    const friction = 0.88;
    const homeSpring = 0.004;
    const galaxyRadial = 180;
    const galaxySpin   = 540;
    const shockBand = 30;
    const agitateR = 45;
    // Slow grid rotation — one full revolution every ~8 minutes
    const rotAng = this.time * 0.013;
    const cosR = Math.cos(rotAng), sinR = Math.sin(rotAng);
    const rotCX = W / 2, rotCY = H / 2;

    // ─── Attract / idle mode — cosmos plays itself after ~30s untouched ──
    this._idleTime += dt;
    const attract = this._idleTime > 30;
    if (attract && this.time >= this._attractWellAt) {
      if (this.wells.length < 4) {
        const ax = W * (0.2 + Math.random() * 0.6);
        const ay = H * (0.2 + Math.random() * 0.6);
        this.toggleWell(ax, ay, Math.random() < 0.8 ? 'attractor' : 'repulsor');
      }
      this._attractWellAt = this.time + 6 + Math.random() * 8;
    }

    // Spawn rare gravitational tides — broad, slow, no visible wavefront
    if (idleStrength > 0 && this.time >= this._nextTideAt) {
      const ang = Math.random() * Math.PI * 2;
      this._tides.push({
        dirX: Math.cos(ang), dirY: Math.sin(ang),
        born: this.time,
        life: 10 + Math.random() * 15,
        amp: 0.5 + Math.random() * 0.7,
      });
      this._nextTideAt = this.time + 15 + Math.random() * 30;
    }
    this._tides = this._tides.filter(t => this.time - t.born < t.life);

    // ─── Spawn comets ────────────────────────────────────────────────────
    if (this.time >= this._nextCometAt) {
      const edge = Math.floor(Math.random() * 4);
      let cx, cy;
      if      (edge === 0) { cx = Math.random() * W; cy = -10; }
      else if (edge === 1) { cx = W + 10; cy = Math.random() * H; }
      else if (edge === 2) { cx = Math.random() * W; cy = H + 10; }
      else                 { cx = -10; cy = Math.random() * H; }
      const targetX = W * (0.3 + Math.random() * 0.4);
      const targetY = H * (0.3 + Math.random() * 0.4);
      const ang = Math.atan2(targetY - cy, targetX - cx) + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 2;
      this.comets.push({ x: cx, y: cy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, trail: [], age: 0, outAt: null });
      this._nextCometAt = this.time + (attract ? 12 + Math.random() * 18 : 45 + Math.random() * 75);
    }

    // ─── Spawn emergent constellations ───────────────────────────────────
    if (this.time >= this._nextConstellationAt) {
      const pool = this.particles.filter(p => !p.hot);
      if (pool.length > 6) {
        const anchor = pool[Math.floor(Math.random() * pool.length)];
        const near = pool
          .map(p => ({ p, d: Math.hypot(p.homeX - anchor.homeX, p.homeY - anchor.homeY) }))
          .filter(o => o.d < Math.min(W, H) * 0.18)
          .sort((a, b) => a.d - b.d)
          .slice(0, 5 + Math.floor(Math.random() * 2))
          .map(o => o.p);
        if (near.length >= 4) {
          this.constellations.push({ pts: near, born: this.time, life: 7 + Math.random() * 4 });
        }
      }
      this._nextConstellationAt = this.time + 15 + Math.random() * 20;
    }
    this.constellations = this.constellations.filter(c => this.time - c.born < c.life);

    const shape = this.config.gridShape;
    const gridP = shape === 'grid' ? this._gridParams() : null;
    const hexP = shape === 'hex' ? this._hexLayoutParams() : null;
    const radialP = shape === 'radial' ? this._radialLayoutParams() : null;
    const spacingX = gridP ? gridP.spacingX : 0;
    const spacingY = gridP ? gridP.spacingY : 0;
    const connectionThreshold = shape === 'hex' ? hexP.hexSpacing * 1.25
      : shape === 'radial' ? radialP.radialSpacing * 1.3
      : Math.max(spacingX, spacingY) * 1.55;
    const wellInfluenceBase = Math.min(W, H) * 0.22;

    const mx = this.mouse.x;
    const my = this.mouse.y;
    const attractMode = this.mouse.down;

    const hotParticles = this.particles.filter(p => p.hot);

    // ─── Advance + expire gravity wells ─────────────────────────────────
    const dyingWells = [];
    for (const w of this.wells) {
      w.age += dt;
      w.tiltAngle += w.tiltSpeed * dt;
      if (w.age >= w.lifespan) dyingWells.push(w);
    }
    for (const w of dyingWells) {
      this.galaxyDust = this.galaxyDust.filter(d => d.wellId !== w.id);
      const sizeFrac = w.lifespan / 60;
      if (w.lifespan > 40 && w.type === 'attractor') {
        // SUPERNOVA — flash, spark burst, lingering remnant stars
        this.flashes.push({ x: w.x, y: w.y, t: 0, duration: 0.6, maxR: 90 * (1 + sizeFrac) });
        this.shockwaves.push({ x: w.x, y: w.y, t: 0, duration: 1.6, maxR: Math.max(W, H) * 0.6, strength: 2.0 });
        for (let i = 0; i < 60; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 4 + Math.random() * 9;
          this.sparks.push({ x: w.x, y: w.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            life: 0, maxLife: 1.0 + Math.random() * 1.0, size: 0.8 + Math.random() * 1.4 });
        }
        for (let i = 0; i < 6; i++) {
          this.bgStars.push({ x: w.x + (Math.random() - 0.5) * 80, y: w.y + (Math.random() - 0.5) * 80,
            size: 0.4 + Math.random() * 0.5, alpha: 0.12 + Math.random() * 0.2 });
        }
      } else {
        const maxR = Math.max(W, H) * (0.06 + 0.09 * sizeFrac);
        this.shockwaves.push({ x: w.x, y: w.y, t: 0, duration: 0.9 + sizeFrac * 0.4, maxR, strength: 0.15 });
      }
    }
    this.wells = this.wells.filter(w => w.age < w.lifespan);

    // ─── Well drift + plane rotation ─────────────────────────────────────
    if (this.wells.length > 0) {
      // Accumulate inter-well gravity (smaller wells pulled harder by larger ones)
      const accX = new Float32Array(this.wells.length);
      const accY = new Float32Array(this.wells.length);
      for (let i = 0; i < this.wells.length; i++) {
        for (let j = 0; j < this.wells.length; j++) {
          if (i === j) continue;
          const wi = this.wells[i], wj = this.wells[j];
          const dx = wj.x - wi.x, dy = wj.y - wi.y;
          const d = Math.hypot(dx, dy) || 0.001;
          if (d < 60) continue;
          const acc = 0.3 * (wj.lifespan / wi.lifespan) / d;
          accX[i] += (dx / d) * acc;
          accY[i] += (dy / d) * acc;
        }
      }
      for (let i = 0; i < this.wells.length; i++) {
        const w = this.wells[i];
        w.vx = (w.vx + accX[i]) * 0.97;
        w.vy = (w.vy + accY[i]) * 0.97;
        w.x += w.vx;
        w.y += w.vy;
      }
      // Rotate with the particle plane
      const dRot = 0.013 * dt;
      const cosW = Math.cos(dRot), sinW = Math.sin(dRot);
      for (const w of this.wells) {
        const dx = w.x - rotCX, dy = w.y - rotCY;
        w.x = rotCX + dx * cosW - dy * sinW;
        w.y = rotCY + dx * sinW + dy * cosW;
      }
    }

    // ─── Well merge / annihilation ───────────────────────────────────────
    if (this.wells.length > 1) {
      const toRemove = new Set();
      const toAdd = [];
      for (let i = 0; i < this.wells.length; i++) {
        for (let j = i + 1; j < this.wells.length; j++) {
          const a = this.wells[i], b = this.wells[j];
          if (toRemove.has(a.id) || toRemove.has(b.id)) continue;
          if (Math.hypot(a.x - b.x, a.y - b.y) > 40) continue;
          if (a.type !== b.type) {
            // Annihilation — big shockwave, both gone
            const maxR = Math.max(W, H) * 0.55;
            this.shockwaves.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: 0, duration: 1.4, maxR, strength: 2.5 });
          } else {
            // Merge — weighted by remaining lifespan
            const aRemain = a.lifespan - a.age;
            const bRemain = b.lifespan - b.age;
            const total = aRemain + bRemain;
            const wA = aRemain / total;
            const newId = Date.now() + Math.random();
            const newLifespan = Math.min(total, 60);
            const heavier = aRemain >= bRemain ? a : b;
            const merged = {
              x: a.x * wA + b.x * (1 - wA),
              y: a.y * wA + b.y * (1 - wA),
              age: 0, lifespan: newLifespan, type: a.type,
              spin: heavier.spin, id: newId,
              tiltAngle: heavier.tiltAngle,
              tiltSpeed: heavier.tiltSpeed,
              vx: a.vx * wA + b.vx * (1 - wA),
              vy: a.vy * wA + b.vy * (1 - wA),
            };
            toAdd.push(merged);
            // Reassign galaxy dust from both wells to the merged well
            for (const d of this.galaxyDust) {
              if (d.wellId === a.id || d.wellId === b.id) d.wellId = newId;
            }
            this.shockwaves.push({ x: merged.x, y: merged.y, t: 0, duration: 1.0, maxR: Math.max(W, H) * 0.2, strength: 1.0 });
          }
          toRemove.add(a.id);
          toRemove.add(b.id);
        }
      }
      if (toRemove.size > 0) {
        this.wells = this.wells.filter(w => !toRemove.has(w.id)).concat(toAdd);
        // Remove dust orphaned by annihilation
        this.galaxyDust = this.galaxyDust.filter(d => this.wells.some(w => w.id === d.wellId));
      }
    }

    // ─── Advance shockwaves ──────────────────────────────────────────────
    for (const s of this.shockwaves) {
      s.t = Math.min(s.t + dt, s.duration);
      const prog = s.t / s.duration;
      s.r = s.maxR * (1 - Math.pow(1 - prog, 2.5));
    }

    // ─── Update particles ────────────────────────────────────────────────
    for (const p of this.particles) {
      if (p.hot) {
        p._galaxyT = 0;
        // Wanderer: slow two-frequency sinuous drift, no home spring
        const wAmp = idleStrength * 5;
        p.vx += Math.sin(this.time * 0.09 + p.phaseX) * wAmp;
        p.vy += Math.cos(this.time * 0.13 + p.phaseY) * wAmp;
        // Loose tether to keep wanderers visible on screen
        const distC = Math.hypot(p.x - W / 2, p.y - H / 2);
        if (distC > Math.min(W, H) * 0.48) {
          p.vx += (W / 2 - p.x) * 0.002;
          p.vy += (H / 2 - p.y) * 0.002;
        }
      } else {
        // Home spring — suppressed near attractors so particles can orbit freely
        let homeSpringMult = 1.0;
        for (const w of this.wells) {
          if (w.type === 'repulsor') continue;
          const wInfluence = wellInfluenceBase * (1 + 0.5 * Math.max(0, (w.lifespan - 10) / 50));
          const _wd = Math.hypot(w.x - p.x, w.y - p.y);
          if (_wd < wInfluence) homeSpringMult = Math.min(homeSpringMult, _wd / wInfluence);
        }
        const hdx = p.homeX - rotCX, hdy = p.homeY - rotCY;
        const rotHomeX = rotCX + hdx * cosR - hdy * sinR;
        const rotHomeY = rotCY + hdx * sinR + hdy * cosR;
        p.vx += (rotHomeX - p.x) * homeSpring * homeSpringMult;
        p.vy += (rotHomeY - p.y) * homeSpring * homeSpringMult;

        const waveAmp = idleStrength * 3;

        // Slow personal cosmic drift — unique long-period ellipse per particle (~40–85s)
        const f1 = 0.018 + (p.phaseX / (Math.PI * 2)) * 0.010;
        const f2 = 0.013 + (p.phaseY / (Math.PI * 2)) * 0.008;
        p.vx += Math.cos(this.time * f1 + p.phaseX) * waveAmp * 1.4;
        p.vy += Math.sin(this.time * f2 + p.phaseY) * waveAmp * 1.4;

        // Rare gravitational tides — broad slow pushes, no wavefront
        for (const t of this._tides) {
          const age = this.time - t.born;
          const env = Math.sin(Math.PI * age / t.life);
          p.vx += t.dirX * env * t.amp * waveAmp * 1.2;
          p.vy += t.dirY * env * t.amp * waveAmp * 1.2;
        }

        // Agitation from nearby hot particles
        for (const h of hotParticles) {
          const hd = Math.hypot(p.x - h.x, p.y - h.y);
          if (hd < agitateR) {
            const boost = (1 - hd / agitateR) * 4;
            p.vx += Math.sin(this.time * 1.25 + p.phaseX + h.phaseX) * idleStrength * boost;
            p.vy += Math.cos(this.time * 1.25 + p.phaseY + h.phaseY) * idleStrength * boost;
          }
        }
      }

      // Cursor force (all particles)
      const ddx = p.x - mx;
      const ddy = p.y - my;
      const dist = Math.hypot(ddx, ddy) || 0.001;
      if (dist < influenceR) {
        const force = reactivity / (dist * dist);
        const sign = attractMode ? -1 : 1;
        p.vx += sign * (ddx / dist) * force;
        p.vy += sign * (ddy / dist) * force;
      }

      // Galaxy wells — radial capture + tangential spin (attractors) or radial push (repulsors)
      for (const w of this.wells) {
        const wInfluence = wellInfluenceBase * (1 + 0.5 * Math.max(0, (w.lifespan - 10) / 50));
        const wdx = w.x - p.x;
        const wdy = w.y - p.y;
        const wd = Math.hypot(wdx, wdy) || 0.001;
        if (wd < wInfluence) {
          const effD = Math.max(wd, 22);
          const radialF = Math.min(galaxyRadial / (effD * effD), 0.7);
          if (w.type === 'repulsor') {
            p.vx -= (wdx / wd) * radialF;
            p.vy -= (wdy / wd) * radialF;
          } else {
            p.vx += (wdx / wd) * radialF;
            p.vy += (wdy / wd) * radialF;
            const tangF = Math.min(galaxySpin / (effD * effD), 2.2);
            p.vx += w.spin * (-wdy / wd) * tangF;
            p.vy += w.spin * (wdx / wd) * tangF;
          }
        }
      }

      // Galaxy capture tint + tilt squash (attractors only, non-hot)
      if (!p.hot) {
        let gT = 0;
        for (const w of this.wells) {
          if (w.type === 'repulsor') continue;
          const wInfluence = wellInfluenceBase * (1 + 0.5 * Math.max(0, (w.lifespan - 10) / 50));
          const gwd = Math.hypot(w.x - p.x, w.y - p.y);
          if (gwd < wInfluence) gT = Math.max(gT, 1 - gwd / wInfluence);
        }
        p._galaxyT = gT;
        for (const w of this.wells) {
          if (w.type === 'repulsor') continue;
          const wInfluence = wellInfluenceBase * (1 + 0.5 * Math.max(0, (w.lifespan - 10) / 50));
          const wd = Math.hypot(w.x - p.x, w.y - p.y);
          if (wd < wInfluence) {
            const tnx = Math.cos(w.tiltAngle);
            const tny = Math.sin(w.tiltAngle);
            const vDotN = p.vx * tnx + p.vy * tny;
            p.vx -= tnx * vDotN * 0.04;
            p.vy -= tny * vDotN * 0.04;
          }
        }
      }

      // Shockwave impulse (all particles)
      for (const s of this.shockwaves) {
        const sd = Math.hypot(p.x - s.x, p.y - s.y) || 0.001;
        const gap = Math.abs(sd - s.r);
        if (gap < shockBand) {
          const falloff = 1 - gap / shockBand;
          const force = 4000 * falloff * (s.strength ?? 1.0);
          p.vx += ((p.x - s.x) / sd) * force * dt;
          p.vy += ((p.y - s.y) / sd) * force * dt;
        }
      }

      p.vx *= friction;
      p.vy *= friction;
      p.x += p.vx;
      p.y += p.vy;
    }

    // ─── Update galaxy dust ──────────────────────────────────────────────
    for (const d of this.galaxyDust) {
      const w = this.wells.find(ww => ww.id === d.wellId);
      if (!w) continue;
      const wdx = w.x - d.x;
      const wdy = w.y - d.y;
      const wd = Math.hypot(wdx, wdy) || 0.001;
      const effD = Math.max(wd, 15);
      const radialF = Math.min(galaxyRadial / (effD * effD), 0.7);
      d.vx += (wdx / wd) * radialF;
      d.vy += (wdy / wd) * radialF;
      const tangF = Math.min(galaxySpin / (effD * effD), 2.2);
      d.vx += w.spin * (-wdy / wd) * tangF;
      d.vy += w.spin * (wdx / wd) * tangF;
      const tnx = Math.cos(w.tiltAngle);
      const tny = Math.sin(w.tiltAngle);
      const vDotN = d.vx * tnx + d.vy * tny;
      d.vx -= tnx * vDotN * 0.04;
      d.vy -= tny * vDotN * 0.04;
      for (const s of this.shockwaves) {
        const sd = Math.hypot(d.x - s.x, d.y - s.y) || 0.001;
        const gap = Math.abs(sd - s.r);
        if (gap < shockBand) {
          const falloff = 1 - gap / shockBand;
          const force = 4000 * falloff * (s.strength ?? 1.0);
          d.vx += ((d.x - s.x) / sd) * force * dt;
          d.vy += ((d.y - s.y) / sd) * force * dt;
        }
      }
      d.vx *= friction;
      d.vy *= friction;
      d.x += d.vx;
      d.y += d.vy;
    }

    this.shockwaves = this.shockwaves.filter(s => s.t < s.duration);

    // ─── Update comets ────────────────────────────────────────────────────
    for (const c of this.comets) {
      c.age += dt;
      c.trail.push({ x: c.x, y: c.y });
      if (c.trail.length > 60) c.trail.shift();
      // Well influence (50% strength, wider capture radius)
      for (const w of this.wells) {
        const wdx = w.x - c.x, wdy = w.y - c.y;
        const wd = Math.hypot(wdx, wdy) || 0.001;
        const wInfluence = wellInfluenceBase * (1 + 0.5 * Math.max(0, (w.lifespan - 10) / 50));
        if (wd < wInfluence * 1.5) {
          const effD = Math.max(wd, 22);
          const radialF = Math.min(galaxyRadial / (effD * effD), 0.7) * 0.5;
          if (w.type === 'repulsor') {
            c.vx -= (wdx / wd) * radialF;
            c.vy -= (wdy / wd) * radialF;
          } else {
            c.vx += (wdx / wd) * radialF;
            c.vy += (wdy / wd) * radialF;
            const tangF = Math.min(galaxySpin / (effD * effD), 2.2) * 0.5;
            c.vx += w.spin * (-wdy / wd) * tangF;
            c.vy += w.spin * (wdx / wd) * tangF;
          }
        }
      }
      // Shockwave impulse
      for (const s of this.shockwaves) {
        const sd = Math.hypot(c.x - s.x, c.y - s.y) || 0.001;
        const gap = Math.abs(sd - s.r);
        if (gap < shockBand) {
          const falloff = 1 - gap / shockBand;
          c.vx += ((c.x - s.x) / sd) * 4000 * falloff * (s.strength ?? 1.0) * dt;
          c.vy += ((c.y - s.y) / sd) * 4000 * falloff * (s.strength ?? 1.0) * dt;
        }
      }
      c.vx *= 0.999;
      c.vy *= 0.999;
      c.x += c.vx;
      c.y += c.vy;
      const margin = 80;
      if (!c.outAt && (c.x < -margin || c.x > W + margin || c.y < -margin || c.y > H + margin)) {
        c.outAt = this.time;
      }
    }
    this.comets = this.comets.filter(c => !c.outAt || this.time - c.outAt < 1.5);

    // ─── Update supernova sparks + flashes ───────────────────────────────
    for (const sp of this.sparks) {
      sp.life += dt;
      sp.vx *= 0.96; sp.vy *= 0.96;
      sp.x += sp.vx; sp.y += sp.vy;
    }
    this.sparks = this.sparks.filter(sp => sp.life < sp.maxLife);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter(f => f.t < f.duration);

    // ─── Compute per-particle depth (centre = 1.0, edges scale with slider) ─
    {
      let gridCX, gridCY, gridMaxDist;
      if (shape === 'hex') {
        gridCX = hexP.cx;
        gridCY = hexP.cy;
        gridMaxDist = hexP.halfW;
      } else if (shape === 'radial') {
        gridCX = radialP.cx;
        gridCY = radialP.cy;
        gridMaxDist = radialP.N * radialP.radialSpacing;
      } else {
        const { cols, rows, marginX, marginY } = gridP;
        gridCX = marginX + (cols - 1) * spacingX / 2;
        gridCY = marginY + (rows - 1) * spacingY / 2;
        gridMaxDist = Math.hypot((cols - 1) * spacingX / 2, (rows - 1) * spacingY / 2);
      }
      const s = this.config.depthStrength / 100;
      for (const p of this.particles) {
        const d = Math.hypot(p.homeX - gridCX, p.homeY - gridCY);
        const tempT = Math.min(1, Math.pow(d / gridMaxDist, 1.6));
        p._tempT = tempT;
        const rawDepth = Math.max(0.2, 1 - tempT);
        p._depth = 1 - s * (1 - rawDepth);
      }
    }

    // ─── Draw nebula gas clouds (furthest back) ──────────────────────────
    for (const nb of this.nebulae) {
      const ox = Math.cos(this.time * 0.01 + nb.phase) * nb.driftSpeed * 6;
      const oy = Math.sin(this.time * 0.008 + nb.phase) * nb.driftSpeed * 6;
      const nx = nb.x + ox, ny = nb.y + oy;
      const a = nb.maxA * (0.7 + 0.3 * Math.sin(this.time * 0.05 + nb.phase));
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nb.r);
      g.addColorStop(0, `rgba(${nb.cr},${nb.cg},${nb.cb},${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${nb.cr},${nb.cg},${nb.cb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(nx - nb.r, ny - nb.r, nb.r * 2, nb.r * 2);
    }

    // ─── Draw background stars (lensed by wells) ─────────────────────────
    for (const s of this.bgStars) {
      const [sx, sy] = this._lensPoint(s.x, s.y);
      ctx.beginPath();
      ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,195,220,${s.alpha.toFixed(2)})`;
      ctx.fill();
    }

    // ─── Draw low-poly quad fills (grid shape only) ───────────────────────
    if (shape === 'grid') {
      const { cols, rows } = gridP;
      const distThreshold = Math.max(spacingX, spacingY) * 0.55;

      // Particle lookup by grid position
      const gmap = new Map();
      for (const p of this.particles) {
        if (!p.hot) gmap.set(p.col * 10000 + p.row, p);
      }

      const settle = p => Math.max(0, 1 - Math.hypot(p.x - p.homeX, p.y - p.homeY) / distThreshold);

      // Pass 1: compute quad settledness
      const qs = new Float32Array(cols * rows);
      for (let row = 0; row < rows - 1; row++) {
        for (let col = 0; col < cols - 1; col++) {
          const a = gmap.get(col * 10000 + row);
          const b = gmap.get((col + 1) * 10000 + row);
          const c = gmap.get(col * 10000 + (row + 1));
          const d = gmap.get((col + 1) * 10000 + (row + 1));
          if (!a || !b || !c || !d) continue;
          qs[row * cols + col] = Math.min(settle(a), settle(b), settle(c), settle(d));
        }
      }

      // Pass 2: draw quads, brightened by settled neighbors
      for (let row = 0; row < rows - 1; row++) {
        for (let col = 0; col < cols - 1; col++) {
          const quadS = qs[row * cols + col];
          if (quadS < 0.02) continue;

          let neighborSum = 0, neighborCount = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = row + dr, nc = col + dc;
              if (nr >= 0 && nr < rows - 1 && nc >= 0 && nc < cols - 1) {
                neighborSum += qs[nr * cols + nc];
                neighborCount++;
              }
            }
          }
          const neighborAvg = neighborCount > 0 ? neighborSum / neighborCount : 0;
          const boost = 1 + neighborAvg * 1.8;

          const a = gmap.get(col * 10000 + row);
          const b = gmap.get((col + 1) * 10000 + row);
          const c = gmap.get(col * 10000 + (row + 1));
          const d = gmap.get((col + 1) * 10000 + (row + 1));

          const quadDep = (a._depth + b._depth + c._depth + d._depth) * 0.25;
          const alpha = Math.min(quadS * 0.05 * boost * quadDep, 0.13);

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(d.x, d.y);
          ctx.lineTo(c.x, c.y);
          ctx.closePath();
          ctx.fillStyle = `rgba(196,184,168,${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }
    }

    // ─── Draw shockwaves ─────────────────────────────────────────────────
    for (const s of this.shockwaves) {
      const progress = s.t / s.duration;

      const flashAlpha = Math.max(0, 1 - s.t / 0.15) * 0.5;
      if (flashAlpha > 0) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(196,184,168,${flashAlpha.toFixed(2)})`;
        ctx.fill();
      }

      if (s.r > 6) {
        const innerAlpha = (1 - progress) * 0.2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(196,184,168,${innerAlpha.toFixed(2)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      const alpha = (1 - progress) * 0.55;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(196,184,168,${alpha.toFixed(2)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // ─── Draw connections ────────────────────────────────────────────────
    const pts = this.particles;
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i];
      for (let j = i + 1; j < n; j++) {
        const b = pts[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const isHot = a.hot || b.hot;
        const threshold = isHot ? connectionThreshold * 1.9 : connectionThreshold;
        if (d >= threshold) continue;
        const flicker = 0.55 + 0.45 * Math.sin(this.time * 6.5 + a.phaseX + b.phaseX);
        const dep = isHot ? 1.0 : (a._depth + b._depth) * 0.5;
        const alpha = (1 - d / threshold) * (isHot ? 0.35 : 0.5) * flicker * dep;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (isHot) {
          ctx.strokeStyle = `rgba(220,130,70,${alpha.toFixed(3)})`;
        } else {
          const lineTT = ((a._tempT ?? 0.5) + (b._tempT ?? 0.5)) * 0.5;
          const lBaseR = Math.round(220 + lineTT * (90  - 220));
          const lBaseG = Math.round(155 + lineTT * (125 - 155));
          const lBaseB = Math.round(80  + lineTT * (200 - 80 ));
          const lineGT = Math.max(a._galaxyT ?? 0, b._galaxyT ?? 0) * 0.6;
          const lr = Math.round(lBaseR + lineGT * (170 - lBaseR));
          const lg = Math.round(lBaseG + lineGT * (50  - lBaseG));
          const lb = Math.round(lBaseB + lineGT * (255 - lBaseB));
          ctx.strokeStyle = `rgba(${lr},${lg},${lb},${alpha.toFixed(3)})`;
        }
        ctx.lineWidth = isHot ? 0.5 : 0.5 * dep;
        ctx.stroke();
      }
    }

    // ─── Draw emergent constellations ────────────────────────────────────
    for (const con of this.constellations) {
      const env = Math.sin(Math.PI * (this.time - con.born) / con.life);
      const a = env * 0.5;
      ctx.strokeStyle = `rgba(235,228,210,${a.toFixed(3)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(con.pts[0].x, con.pts[0].y);
      for (let i = 1; i < con.pts.length; i++) ctx.lineTo(con.pts[i].x, con.pts[i].y);
      ctx.stroke();
      for (const p of con.pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245,240,225,${(env * 0.8).toFixed(2)})`;
        ctx.fill();
      }
    }

    // ─── Draw grey particles ─────────────────────────────────────────────
    for (const p of this.particles) {
      if (p.hot) continue;
      const dep = p._depth;
      const tT = p._tempT ?? 0.5;
      const baseR = Math.round(220 + tT * (90  - 220));
      const baseG = Math.round(155 + tT * (125 - 155));
      const baseB = Math.round(80  + tT * (200 - 80 ));
      const gT = p._galaxyT ?? 0;
      const r = Math.round(baseR + gT * (170 - baseR));
      const g = Math.round(baseG + gT * (50  - baseG));
      const b = Math.round(baseB + gT * (255 - baseB));
      const f1 = 0.018 + (p.phaseX / (Math.PI * 2)) * 0.010;
      const breathe = Math.sin(this.time * f1 + p.phaseX) * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, (p.size + breathe) * dep), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${dep.toFixed(2)})`;
      ctx.fill();
    }

    // ─── Draw galaxy dust ────────────────────────────────────────────────
    for (const d of this.galaxyDust) {
      const w = this.wells.find(ww => ww.id === d.wellId);
      if (!w) continue;
      const wd = Math.hypot(d.x - w.x, d.y - w.y);
      const wInfluence = wellInfluenceBase * (1 + 0.5 * Math.max(0, (w.lifespan - 10) / 50));
      const proximity = Math.max(0, 1 - wd / wInfluence);
      const alpha = 0.35 + proximity * 0.55;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(170,50,255,${alpha.toFixed(2)})`;
      ctx.fill();
    }

    // ─── Draw comets ─────────────────────────────────────────────────────
    for (const c of this.comets) {
      const n = c.trail.length;
      for (let i = 0; i < n; i++) {
        const pt = c.trail[i];
        const t = i / Math.max(n - 1, 1);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 0.4 + t * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220,210,255,${(t * 0.55).toFixed(2)})`;
        ctx.fill();
      }
      // Soft glow
      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 7);
      grad.addColorStop(0, 'rgba(200,185,255,0.45)');
      grad.addColorStop(1, 'rgba(200,185,255,0)');
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(235,230,255,0.95)';
      ctx.fill();
    }

    // ─── Draw supernova sparks (white → amber, fading) ───────────────────
    for (const sp of this.sparks) {
      const k = 1 - sp.life / sp.maxLife;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size * k, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,${Math.round(200 + 55 * k)},${Math.round(120 * k)},${(k * 0.9).toFixed(2)})`;
      ctx.fill();
    }

    // ─── Draw hot particles (on top, slightly larger) ────────────────────
    ctx.fillStyle = '#E8631A';
    for (const p of this.particles) {
      if (!p.hot) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // ─── Draw gravity wells ──────────────────────────────────────────────
    const pingT = 1.4;

    for (const w of this.wells) {
      const scale = 1 + 2 * Math.max(0, (w.lifespan - 10) / 50);
      const wPingR = 55 * scale;
      const arm = 9 * scale;
      const lifeProg = w.age / w.lifespan;
      const deathFrac = Math.max(0, (lifeProg - 0.7) / 0.3);

      let cr, cg, cb;
      if (w.type === 'repulsor') {
        // Amber → orange-red as it dies
        cr = Math.round(220 + deathFrac * (220 - 220));
        cg = Math.round(160 + deathFrac * (60 - 160));
        cb = Math.round(40  + deathFrac * (40  - 40));
      } else {
        // Grey → red as it dies
        cr = Math.round(196 + deathFrac * (220 - 196));
        cg = Math.round(184 + deathFrac * (55  - 184));
        cb = Math.round(168 + deathFrac * (55  - 168));
      }

      // Territory ring
      ctx.beginPath();
      ctx.arc(w.x, w.y, wPingR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.12)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Ping rings
      for (let i = 0; i < 2; i++) {
        const phase = ((this.time + i * pingT / 2) % pingT) / pingT;
        const r = phase * wPingR;
        const alpha = (1 - phase) * 0.28;
        ctx.beginPath();
        ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(2)})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      // Crosshair icon — + for attractor, × for repulsor
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.65)`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      if (w.type === 'repulsor') {
        const d = arm * 0.707;
        ctx.moveTo(w.x - d, w.y - d); ctx.lineTo(w.x + d, w.y + d);
        ctx.moveTo(w.x + d, w.y - d); ctx.lineTo(w.x - d, w.y + d);
      } else {
        ctx.moveTo(w.x - arm, w.y); ctx.lineTo(w.x + arm, w.y);
        ctx.moveTo(w.x, w.y - arm); ctx.lineTo(w.x, w.y + arm);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w.x, w.y, 2.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.75)`;
      ctx.fill();
    }

    // ─── Draw supernova flashes (brightest, on top) ──────────────────────
    for (const f of this.flashes) {
      const k = 1 - f.t / f.duration;
      const r = f.maxR * (1 - k * 0.3);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,250,235,${(k * 0.9).toFixed(2)})`);
      g.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = g;
      ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
    }
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
  }
}
