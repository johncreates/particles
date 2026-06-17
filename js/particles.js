// Particle field engine — all coordinates in CSS pixels

export class ParticleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.blobPoints = [];
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
        homeX: cx + dx,  // fixed spawn position for home spring
        homeY: cy + dy,
        ndx: dx / r,     // normalized, survives cloud resize
        ndy: dy / r,
        vx: 0,
        vy: 0,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        size: this.config.particleSize,
      });
    }
  }

  // ─── Rebuild home positions after cloud size or viewport change ───────────
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
    const homeSpring = 0.004; // gentle pull back toward spawn position
    const freq = 0.5;

    const mx = this.mouse.x;
    const my = this.mouse.y;
    const attractMode = this.mouse.down;
    const cx = W / 2;
    const cy = H / 2;

    for (const p of this.particles) {
      // Home spring — keeps the cloud shape intact
      p.vx += (p.homeX - p.x) * homeSpring;
      p.vy += (p.homeY - p.y) * homeSpring;

      // Idle drift (oscillates around home)
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

      // Friction + integrate
      p.vx *= friction;
      p.vy *= friction;
      p.x += p.vx;
      p.y += p.vy;
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
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
  }
}
