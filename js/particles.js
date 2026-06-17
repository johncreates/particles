// Particle field engine — all coordinates in CSS pixels

export class ParticleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.blobPoints = [];
    this.wells = [];       // { x, y }  max 5
    this.shockwaves = [];  // { x, y, r, maxR }
    this.time = 0;
    this.mouse = { x: -9999, y: -9999, down: false };

    this.config = {
      count: 300,
      particleSize: 2,
      reactivity: 40,
      idleEnergy: 25,
      cloudSize: 'M',
    };

    this._resize();
    this.generateBlob();
    this.spawnParticles();

    this._onResize = this._resize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  // ─── CSS pixel dimensions ─────────────────────────────────────────────────
  get _dpr() { return window.devicePixelRatio || 1; }
  get _W() { return window.innerWidth; }
  get _H() { return window.innerHeight; }

  // ─── Cloud radius in CSS pixels ───────────────────────────────────────────
  cloudRadius() {
    const base = Math.min(this._W, this._H);
    const map = { S: 0.15, M: 0.25, L: 0.38, XL: 0.55 };
    return base * (map[this.config.cloudSize] ?? 0.25);
  }

  // ─── Blob boundary (sum-of-sines radius noise) ───────────────────────────
  generateBlob() {
    const N = 64;
    const freqs = [
      { f: 2, a: 0.12, p: Math.random() * Math.PI * 2 },
      { f: 3, a: 0.08, p: Math.random() * Math.PI * 2 },
      { f: 5, a: 0.05, p: Math.random() * Math.PI * 2 },
      { f: 7, a: 0.03, p: Math.random() * Math.PI * 2 },
    ];
    this.blobPoints = Array.from({ length: N }, (_, i) => {
      const angle = (i / N) * Math.PI * 2;
      const noise = freqs.reduce((s, { f, a, p }) => s + Math.sin(f * angle + p) * a, 0);
      return { angle, r: 1 + noise };
    });
  }

  _blobRadiusAt(angle) {
    const N = this.blobPoints.length;
    const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const fi = (normalized / (Math.PI * 2)) * N;
    const i0 = Math.floor(fi) % N;
    const i1 = (i0 + 1) % N;
    const t = fi - Math.floor(fi);
    return this.blobPoints[i0].r * (1 - t) + this.blobPoints[i1].r * t;
  }

  _insideBlob(dx, dy) {
    const angle = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    return dist < this.cloudRadius() * this._blobRadiusAt(angle);
  }

  // ─── Spawn particles inside the blob ─────────────────────────────────────
  spawnParticles() {
    this.particles = [];
    const cx = this._W / 2;
    const cy = this._H / 2;
    const r = this.cloudRadius();
    let attempts = 0;
    while (this.particles.length < this.config.count && attempts < this.config.count * 20) {
      attempts++;
      const dx = (Math.random() * 2 - 1) * r * 1.1;
      const dy = (Math.random() * 2 - 1) * r * 1.1;
      if (!this._insideBlob(dx, dy)) continue;
      this.particles.push({
        x: cx + dx,
        y: cy + dy,
        homeX: cx + dx,
        homeY: cy + dy,
        ndx: dx / r,
        ndy: dy / r,
        vx: 0,
        vy: 0,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        size: this.config.particleSize,
      });
    }
  }

  _rehome() {
    const cx = this._W / 2;
    const cy = this._H / 2;
    const r = this.cloudRadius();
    for (const p of this.particles) {
      p.homeX = cx + p.ndx * r;
      p.homeY = cy + p.ndy * r;
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
    this.generateBlob();
    this.spawnParticles();
  }

  toggleWell(x, y) {
    const hitIdx = this.wells.findIndex(w => Math.hypot(w.x - x, w.y - y) < 28);
    if (hitIdx !== -1) {
      this.wells.splice(hitIdx, 1);
    } else if (this.wells.length < 5) {
      this.wells.push({ x, y });
    }
  }

  addShockwave(x, y) {
    this.shockwaves.push({ x, y, r: 0, maxR: this.cloudRadius() * 2.2 });
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
    const influenceR = this.cloudRadius() * 0.8;
    const connectionThreshold = this.cloudRadius() * 0.48;
    const friction = 0.88;
    const homeSpring = 0.004;
    const freq = 0.5;
    const wellStrength = 900;
    const wellInfluence = this.cloudRadius() * 1.2;
    const shockSpeed = 320;
    const shockBand = 30;

    const mx = this.mouse.x;
    const my = this.mouse.y;
    const attractMode = this.mouse.down;

    // ─── Expand shockwaves ───────────────────────────────────────────────
    for (const s of this.shockwaves) {
      s.r += shockSpeed * dt;
    }

    // ─── Update particles ────────────────────────────────────────────────
    for (const p of this.particles) {
      // Home spring
      p.vx += (p.homeX - p.x) * homeSpring;
      p.vy += (p.homeY - p.y) * homeSpring;

      // Idle drift
      p.vx += Math.sin(this.time * freq + p.phaseX) * idleStrength;
      p.vy += Math.cos(this.time * freq + p.phaseY) * idleStrength;

      // Cursor force
      const ddx = p.x - mx;
      const ddy = p.y - my;
      const dist = Math.hypot(ddx, ddy) || 0.001;
      if (dist < influenceR) {
        const force = reactivity / (dist * dist);
        const sign = attractMode ? -1 : 1;
        p.vx += sign * (ddx / dist) * force;
        p.vy += sign * (ddy / dist) * force;
      }

      // Gravity wells
      for (const w of this.wells) {
        const wdx = w.x - p.x;
        const wdy = w.y - p.y;
        const wd = Math.hypot(wdx, wdy) || 0.001;
        if (wd < wellInfluence) {
          const effD = Math.max(wd, 22); // prevent infinite suck-in
          const f = Math.min(wellStrength / (effD * effD), 1.8);
          p.vx += (wdx / wd) * f;
          p.vy += (wdy / wd) * f;
        }
      }

      // Shockwave impulse
      for (const s of this.shockwaves) {
        const sd = Math.hypot(p.x - s.x, p.y - s.y) || 0.001;
        const gap = Math.abs(sd - s.r);
        if (gap < shockBand) {
          const falloff = 1 - gap / shockBand;
          const force = 4000 * falloff;
          p.vx += ((p.x - s.x) / sd) * force * dt;
          p.vy += ((p.y - s.y) / sd) * force * dt;
        }
      }

      // Friction + integrate
      p.vx *= friction;
      p.vy *= friction;
      p.x += p.vx;
      p.y += p.vy;
    }

    // Remove spent shockwaves
    this.shockwaves = this.shockwaves.filter(s => s.r < s.maxR);

    // ─── Draw shockwaves ─────────────────────────────────────────────────
    for (const s of this.shockwaves) {
      const progress = s.r / s.maxR;
      const alpha = (1 - progress) * 0.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(196,184,168,${alpha.toFixed(2)})`;
      ctx.lineWidth = 1.5 * (1 - progress);
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
        if (d >= connectionThreshold) continue;
        const alpha = (1 - d / connectionThreshold) * 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(196,184,168,${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // ─── Draw particles ──────────────────────────────────────────────────
    ctx.fillStyle = '#c4b8a8';
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // ─── Draw gravity wells ──────────────────────────────────────────────
    for (const w of this.wells) {
      const pr = 8 + Math.sin(this.time * 3) * 3;

      // Pulsing ring
      ctx.beginPath();
      ctx.arc(w.x, w.y, pr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(196,184,168,0.3)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Crosshair
      const arm = 5;
      ctx.strokeStyle = 'rgba(196,184,168,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(w.x - arm, w.y); ctx.lineTo(w.x + arm, w.y);
      ctx.moveTo(w.x, w.y - arm); ctx.lineTo(w.x, w.y + arm);
      ctx.stroke();
    }
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
  }
}
