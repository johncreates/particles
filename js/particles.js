// Particle field engine — all coordinates in CSS pixels

export class ParticleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.wells = [];       // { x, y }  max 5
    this.shockwaves = [];  // { x, y, t, duration, maxR }
    this.time = 0;
    this.mouse = { x: -9999, y: -9999, down: false };

    this.config = {
      count: 400,
      particleSize: 2,
      reactivity: 50,
      idleEnergy: 5,
      cloudSize: 'S',
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

  // ─── Spawn particles on grid ──────────────────────────────────────────────
  spawnParticles() {
    this.particles = [];
    const { cols, rows, spacingX, spacingY, marginX, marginY } = this._gridParams();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = marginX + col * spacingX;
        const y = marginY + row * spacingY;
        this.particles.push({
          x, y,
          homeX: x, homeY: y,
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

  // ─── Recompute home positions (resize / grid size change) ─────────────────
  _rehome() {
    const { spacingX, spacingY, marginX, marginY } = this._gridParams();
    for (const p of this.particles) {
      if (p.hot) continue;
      p.homeX = marginX + p.col * spacingX;
      p.homeY = marginY + p.row * spacingY;
      p.x = p.homeX;
      p.y = p.homeY;
      p.vx = 0;
      p.vy = 0;
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
    if (key === 'cloudSize') {
      this._rehome();
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
      this.wells.splice(hitIdx, 1);
    } else if (this.wells.length < 5) {
      this.wells.push({ x, y, age: 0, lifespan: 10 + Math.random() * 50 });
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
    const wellStrength = 900;
    const shockBand = 30;
    const agitateR = 45;

    const { spacingX, spacingY } = this._gridParams();
    const connectionThreshold = Math.max(spacingX, spacingY) * 1.55;
    const wellInfluence = Math.min(W, H) * 0.22;

    const mx = this.mouse.x;
    const my = this.mouse.y;
    const attractMode = this.mouse.down;

    const hotParticles = this.particles.filter(p => p.hot);

    // ─── Advance + expire gravity wells ─────────────────────────────────
    const dyingWells = [];
    for (const w of this.wells) {
      w.age += dt;
      if (w.age >= w.lifespan) dyingWells.push(w);
    }
    for (const w of dyingWells) {
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
        // Home spring — snaps particle back to grid position
        p.vx += (p.homeX - p.x) * homeSpring;
        p.vy += (p.homeY - p.y) * homeSpring;

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

      // Gravity wells (all particles)
      for (const w of this.wells) {
        const wdx = w.x - p.x;
        const wdy = w.y - p.y;
        const wd = Math.hypot(wdx, wdy) || 0.001;
        if (wd < wellInfluence) {
          const effD = Math.max(wd, 22);
          const f = Math.min(wellStrength / (effD * effD), 1.8);
          p.vx += (wdx / wd) * f;
          p.vy += (wdy / wd) * f;
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

    this.shockwaves = this.shockwaves.filter(s => s.t < s.duration);

    // ─── Compute per-particle depth (centre = 1.0, corners ≈ 0.45) ───────
    {
      const cx = W / 2, cy = H / 2;
      const maxDist = Math.hypot(cx, cy);
      for (const p of this.particles) {
        const d = Math.hypot(p.homeX - cx, p.homeY - cy);
        p._depth = Math.max(0.45, 1 - 0.5 * Math.pow(d / maxDist, 1.6));
      }
    }

    // ─── Draw low-poly quad fills ─────────────────────────────────────────
    {
      const { cols, rows } = this._gridParams();
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
        ctx.strokeStyle = isHot
          ? `rgba(220,130,70,${alpha.toFixed(3)})`
          : `rgba(196,184,168,${alpha.toFixed(3)})`;
        ctx.lineWidth = isHot ? 0.5 : 0.5 * dep;
        ctx.stroke();
      }
    }

    // ─── Draw grey particles ─────────────────────────────────────────────
    for (const p of this.particles) {
      if (p.hot) continue;
      const dep = p._depth;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * dep, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(196,184,168,${dep.toFixed(2)})`;
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
