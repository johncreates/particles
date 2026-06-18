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
}
