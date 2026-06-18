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
    const hexSpacing = Math.sqrt(gridW * gridH * 2 / (this.config.count * Math.sqrt(3)));
    const cols = Math.max(2, Math.round(gridW / hexSpacing) + 1);
    const hexSpacingY = hexSpacing * Math.sqrt(3) / 2;
    const rows = Math.max(2, Math.round(gridH / hexSpacingY) + 1);
    return { cols, rows, hexSpacing, hexSpacingY, marginX, marginY };
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
    const { cols, rows, hexSpacing, hexSpacingY, marginX, marginY } = this._hexLayoutParams();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = marginX + col * hexSpacing + (row % 2) * hexSpacing / 2;
        const y = marginY + row * hexSpacingY;
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
      const { hexSpacing, hexSpacingY, marginX, marginY } = this._hexLayoutParams();
      for (const p of this.particles) {
        if (p.hot) continue;
        p.homeX = marginX + p.col * hexSpacing + (p.row % 2) * hexSpacing / 2;
        p.homeY = marginY + p.row * hexSpacingY;
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

  // ─── Canvas resize ────────────────────────────────────────────────────────
  _resize() {
    const dpr = this._dpr;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.particles.length) this._rehome();
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

  toggleWell(x, y) {
    const hitIdx = this.wells.findIndex(w => Math.hypot(w.x - x, w.y - y) < 28);
    if (hitIdx !== -1) {
      const removed = this.wells.splice(hitIdx, 1)[0];
      this.galaxyDust = this.galaxyDust.filter(d => d.wellId !== removed.id);
    } else if (this.wells.length < 5) {
      const wellId = Date.now() + Math.random();
      this.wells.push({
        x, y, age: 0,
        lifespan: 10 + Math.random() * 50,
        spin: Math.random() < 0.5 ? 1 : -1,
        id: wellId,
        tiltAngle: Math.random() * Math.PI * 2,
        tiltSpeed: (0.12 + Math.random() * 0.25) * (Math.random() < 0.5 ? 1 : -1),
      });
      for (let i = 0; i < 50; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 5;
        this.galaxyDust.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 8,
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

    const shape = this.config.gridShape;
    const gridP = shape === 'grid' ? this._gridParams() : null;
    const hexP = shape === 'hex' ? this._hexLayoutParams() : null;
    const radialP = shape === 'radial' ? this._radialLayoutParams() : null;
    const spacingX = gridP ? gridP.spacingX : 0;
    const spacingY = gridP ? gridP.spacingY : 0;
    const connectionThreshold = shape === 'hex' ? hexP.hexSpacing * 1.25
      : shape === 'radial' ? radialP.radialSpacing * 1.3
      : Math.max(spacingX, spacingY) * 1.55;
    const wellInfluence = Math.min(W, H) * 0.22;

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
      const maxR = Math.max(W, H) * (0.06 + 0.09 * sizeFrac);
      this.shockwaves.push({ x: w.x, y: w.y, t: 0, duration: 0.9 + sizeFrac * 0.4, maxR, strength: 0.15 });
    }
    this.wells = this.wells.filter(w => w.age < w.lifespan);

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
        // Home spring — suppressed near galaxy wells so particles can orbit freely
        let homeSpringMult = 1.0;
        for (const w of this.wells) {
          const _wd = Math.hypot(w.x - p.x, w.y - p.y);
          if (_wd < wellInfluence) homeSpringMult = Math.min(homeSpringMult, _wd / wellInfluence);
        }
        p.vx += (p.homeX - p.x) * homeSpring * homeSpringMult;
        p.vy += (p.homeY - p.y) * homeSpring * homeSpringMult;

        // Traveling wave idle
        const wavePhase = p.col * this._wave.kX + p.row * this._wave.kY
                        - this.time * (this._wave.sX + this._wave.sY);
        const waveAmp = idleStrength * 3;
        p.vy += Math.sin(wavePhase) * waveAmp;
        p.vx += Math.sin(wavePhase + 0.6) * waveAmp * 0.25;

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

      // Galaxy wells — radial capture + tangential spin
      for (const w of this.wells) {
        const wdx = w.x - p.x;
        const wdy = w.y - p.y;
        const wd = Math.hypot(wdx, wdy) || 0.001;
        if (wd < wellInfluence) {
          const effD = Math.max(wd, 22);
          const radialF = Math.min(galaxyRadial / (effD * effD), 0.7);
          p.vx += (wdx / wd) * radialF;
          p.vy += (wdy / wd) * radialF;
          const tangF = Math.min(galaxySpin / (effD * effD), 2.2);
          p.vx += w.spin * (-wdy / wd) * tangF;
          p.vy += w.spin * (wdx / wd) * tangF;
        }
      }

      // Galaxy capture tint + tilt squash (non-hot only)
      if (!p.hot) {
        let gT = 0;
        for (const w of this.wells) {
          const gwd = Math.hypot(w.x - p.x, w.y - p.y);
          if (gwd < wellInfluence) gT = Math.max(gT, 1 - gwd / wellInfluence);
        }
        p._galaxyT = gT;
        for (const w of this.wells) {
          const wd = Math.hypot(w.x - p.x, w.y - p.y);
          if (wd < wellInfluence) {
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

    // ─── Compute per-particle depth (centre = 1.0, edges scale with slider) ─
    {
      let gridCX, gridCY, gridMaxDist;
      if (shape === 'hex') {
        const { cols, rows, hexSpacing, hexSpacingY, marginX, marginY } = hexP;
        gridCX = marginX + (cols - 1) * hexSpacing / 2;
        gridCY = marginY + (rows - 1) * hexSpacingY / 2;
        gridMaxDist = Math.hypot((cols - 1) * hexSpacing / 2, (rows - 1) * hexSpacingY / 2);
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
        const rawDepth = Math.max(0.2, 1 - Math.pow(d / gridMaxDist, 1.6));
        p._depth = 1 - s * (1 - rawDepth);
      }
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
          const lineGT = Math.max(a._galaxyT ?? 0, b._galaxyT ?? 0) * 0.6;
          const lr = Math.round(196 + lineGT * (170 - 196));
          const lg = Math.round(184 + lineGT * (50 - 184));
          const lb = Math.round(168 + lineGT * (255 - 168));
          ctx.strokeStyle = `rgba(${lr},${lg},${lb},${alpha.toFixed(3)})`;
        }
        ctx.lineWidth = isHot ? 0.5 : 0.5 * dep;
        ctx.stroke();
      }
    }

    // ─── Draw grey particles ─────────────────────────────────────────────
    for (const p of this.particles) {
      if (p.hot) continue;
      const dep = p._depth;
      const gT = p._galaxyT ?? 0;
      const r = Math.round(196 + gT * (170 - 196));
      const g = Math.round(184 + gT * (50 - 184));
      const b = Math.round(168 + gT * (255 - 168));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * dep, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${dep.toFixed(2)})`;
      ctx.fill();
    }

    // ─── Draw galaxy dust ────────────────────────────────────────────────
    for (const d of this.galaxyDust) {
      const w = this.wells.find(ww => ww.id === d.wellId);
      if (!w) continue;
      const wd = Math.hypot(d.x - w.x, d.y - w.y);
      const proximity = Math.max(0, 1 - wd / wellInfluence);
      const alpha = 0.35 + proximity * 0.55;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(170,50,255,${alpha.toFixed(2)})`;
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
      // Scale 1× (10s well) → 4× (60s well)
      const scale = 1 + 3 * Math.max(0, (w.lifespan - 10) / 50);
      const wPingR = 55 * scale;
      const arm = 9 * scale;

      // deathFrac: 0 until last 30% of life, then ramps to 1
      const lifeProg = w.age / w.lifespan;
      const deathFrac = Math.max(0, (lifeProg - 0.7) / 0.3);
      // Interpolate grey → red
      const cr = Math.round(196 + deathFrac * (220 - 196));
      const cg = Math.round(184 + deathFrac * (55 - 184));
      const cb = Math.round(168 + deathFrac * (55 - 168));

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

      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.65)`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(w.x - arm, w.y); ctx.lineTo(w.x + arm, w.y);
      ctx.moveTo(w.x, w.y - arm); ctx.lineTo(w.x, w.y + arm);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w.x, w.y, 2.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.75)`;
      ctx.fill();
    }
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
  }
}
