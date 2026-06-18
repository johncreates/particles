// Settings pane — builds UI and exposes a callback-based API

export function initSettings(onChange) {
  const toggle = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings-panel');

  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    toggle.classList.toggle('open', open);
  });

  // ─── Slider helper ──────────────────────────────────────────────────────
  function bindSlider(id, key, displayFn) {
    const input = document.getElementById(id);
    const display = document.getElementById(id + '-val');
    input.addEventListener('input', () => {
      const v = Number(input.value);
      display.textContent = displayFn ? displayFn(v) : v;
      onChange(key, v);
    });
    // Set initial display
    display.textContent = displayFn ? displayFn(Number(input.value)) : input.value;
  }

  bindSlider('count-slider', 'count');
  bindSlider('size-slider', 'particleSize', v => v + 'px');
  bindSlider('reactivity-slider', 'reactivity', v => v + '%');
  bindSlider('idle-slider', 'idleEnergy', v => v + '%');
  bindSlider('depth-slider', 'depthStrength', v => v + '%');

  // ─── Grid shape selector ─────────────────────────────────────────────────
  document.querySelectorAll('input[name="grid-shape"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) onChange('gridShape', r.value); });
  });

  // ─── Cloud size segmented control ───────────────────────────────────────
  const sizeRadios = document.querySelectorAll('input[name="cloud-size"]');
  sizeRadios.forEach(r => {
    r.addEventListener('change', () => {
      if (r.checked) onChange('cloudSize', r.value);
    });
  });

  // ─── Re-roll button ──────────────────────────────────────────────────────
  document.getElementById('reroll-btn').addEventListener('click', () => {
    onChange('reroll', null);
  });

  // ─── Save image button ─────────────────────────────────────────────────────
  document.getElementById('export-btn').addEventListener('click', () => {
    onChange('export', null);
  });

  // ─── Speed dial ───────────────────────────────────────────────────────────
  document.querySelectorAll('input[name="speed"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) onChange('speed', Number(r.value)); });
  });

  // ─── Preset buttons ───────────────────────────────────────────────────────
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => onChange('preset', btn.dataset.preset));
  });

  // ─── syncUI — update all controls to match a config object ───────────────
  function syncUI(cfg) {
    const sliders = [
      ['count-slider',      'count',         v => String(v)],
      ['size-slider',       'particleSize',  v => v + 'px'],
      ['reactivity-slider', 'reactivity',    v => v + '%'],
      ['idle-slider',       'idleEnergy',    v => v + '%'],
      ['depth-slider',      'depthStrength', v => v + '%'],
    ];
    for (const [id, key, fmt] of sliders) {
      if (cfg[key] === undefined) continue;
      const el = document.getElementById(id);
      el.value = cfg[key];
      document.getElementById(id + '-val').textContent = fmt(cfg[key]);
    }
    if (cfg.gridShape) {
      const r = document.querySelector(`input[name="grid-shape"][value="${cfg.gridShape}"]`);
      if (r) r.checked = true;
    }
    if (cfg.cloudSize) {
      const r = document.querySelector(`input[name="cloud-size"][value="${cfg.cloudSize}"]`);
      if (r) r.checked = true;
    }
  }

  return { syncUI };
}
