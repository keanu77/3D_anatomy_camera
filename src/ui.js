import { DEFAULTS, LAYERS, RANGES, applyFocus, applyPreset, saveSettings } from './settings.js';
import { REGIONS, regionById } from './regions.js';
import { t, getLanguage } from './i18n.js';
export function bindUI({ settings, onChange, onStart, onDemo, onSwitch, onStop }) {
  const $ = document.getElementById.bind(document);
  const changed = () => { saveSettings(settings); sync(); onChange(); };
  const presetChoices = ['skull', 'skeletal', 'bodyMuscles', 'nervous', 'systems'];
  const focusChoices = [{ id: 'none', label: '全身' }, ...REGIONS];
  for (const { id, label } of focusChoices) {
    const chip = document.createElement('button'); chip.type = 'button'; chip.dataset.focus = id; chip.textContent = t(label);
    chip.addEventListener('click', () => { applyFocus(settings, id); changed(); });
    const option = document.createElement('option'); option.value = id; option.textContent = t(id === 'none' ? '部位：全身' : label);
    $('focus').append(chip); $('focus-mobile').append(option);
  }
  $('focus-mobile').addEventListener('change', e => { applyFocus(settings, e.target.value); changed(); });
  for (const b of $('focusSide').children) b.addEventListener('click', () => { settings.focusSide = b.dataset.side; changed(); });
  $('focus-side-mobile').addEventListener('change', e => { settings.focusSide = e.target.value; changed(); });
  function matchesPreset(preset) {
    const candidate = { ...settings }; applyPreset(candidate, preset);
    return LAYERS.every(key => settings[key] === candidate[key]);
  }
  function sync() {
    for (const key of LAYERS) $(`L_${key}`).checked = settings[key];
    for (const key of Object.keys(RANGES)) $(key).value = settings[key];
    for (const key of ['labels', 'showdata', 'focusZoom']) $(key).checked = settings[key];
    for (const key of ['reveal', 'performance', 'labelLanguage']) $(key).value = settings[key];
    for (const b of $('style').children) {
      const selected = b.dataset.style === settings.style;
      b.classList.toggle('on', selected); b.setAttribute('aria-pressed', String(selected));
    }
    for (const b of document.querySelectorAll('[data-preset]')) {
      const selected = matchesPreset(b.dataset.preset);
      b.classList.toggle('on', selected); b.setAttribute('aria-pressed', String(selected));
    }
    const region = regionById(settings.focus);
    for (const b of $('focus').children) {
      const selected = b.dataset.focus === settings.focus;
      b.classList.toggle('on', selected); b.setAttribute('aria-pressed', String(selected));
    }
    $('focus-mobile').value = settings.focus; $('focus-mobile').classList.toggle('on', !!region);
    for (const b of $('focusSide').children) {
      const selected = b.dataset.side === settings.focusSide;
      b.classList.toggle('on', selected); b.setAttribute('aria-pressed', String(selected)); b.disabled = !region;
    }
    // While a region is focused the mobile bar offers its side; presets come back when focus is left.
    $('focus-side-mobile').value = settings.focusSide; $('focus-side-mobile').hidden = !region; $('preset-cycle').hidden = !!region;
    $('focusZoom').disabled = !region;
    // A side and the enlargement only mean something for a region, so they are not shown as dead controls without one.
    $('focusSide').hidden = $('focus-zoom-row').hidden = !region;
    $('focus-note').textContent = region ? [region.note, region.frame, '選左側或右側可以放得更大；勾選「周邊神經」可加上此處的神經。'].map(t).join(getLanguage() === 'en' ? ' ' : '')
      : t('選一個部位，只顯示該處的肌肉與骨骼並標出名稱。');
    for (const key of ['fs', 'fw', 'fh', 'fd']) $(`${key}v`).textContent = `${Math.round(settings[key] * 100)}%`;
    for (const key of ['fx', 'fy', 'fz']) $(`${key}v`).textContent = `${settings[key] > 0 ? '+' : ''}${settings[key].toFixed(1)} cm`;
    $('featherv').textContent = `${Math.round(settings.feather * 100)}%`;
    $('cutrow').hidden = settings.reveal === 'whole';
    $('cutlabel').textContent = t(settings.reveal === 'lens' ? '透視鏡大小' : '切面位置');
    $('data').hidden = !settings.showdata;
    $('labelLanguage').disabled = !settings.labels;
    $('style-toggle').textContent = t(settings.style === 'xray' ? 'X 光 → 實體' : '實體 → X 光');
  }
  for (const key of [...LAYERS, 'labels', 'showdata', 'focusZoom']) {
    const input = $(LAYERS.includes(key) ? `L_${key}` : key);
    input.addEventListener('change', () => { settings[key] = input.checked; changed(); });
  }
  for (const key of Object.keys(RANGES)) $(key).addEventListener('input', e => { settings[key] = Number(e.target.value); changed(); });
  for (const key of ['reveal', 'performance', 'labelLanguage']) $(key).addEventListener('change', e => { settings[key] = e.target.value; if (key === 'reveal') settings.cut = 0.5; changed(); });
  for (const b of $('style').children) b.addEventListener('click', () => { settings.style = b.dataset.style; changed(); });
  // A preset describes whole systems, so choosing one leaves region focus.
  for (const b of document.querySelectorAll('[data-preset]')) b.addEventListener('click', () => { settings.focus = 'none'; applyPreset(settings, b.dataset.preset); changed(); });
  $('fitreset').addEventListener('click', () => { settings.fs = settings.fw = settings.fh = settings.fd = 1; settings.fx = settings.fy = settings.fz = 0; changed(); });
  $('style-toggle').addEventListener('click', () => { settings.style = settings.style === 'xray' ? 'solid' : 'xray'; changed(); });
  $('preset-cycle').addEventListener('click', () => {
    const current = presetChoices.findIndex(matchesPreset);
    settings.focus = 'none'; applyPreset(settings, presetChoices[(current + 1) % presetChoices.length]); changed();
  });
  // The button names the other language, in that language. Stage labels follow the interface unless changed afterwards.
  const other = getLanguage() === 'en' ? 'zh' : 'en', languageToggle = $('language-toggle');
  languageToggle.textContent = other === 'en' ? 'English' : '中文'; languageToggle.lang = other === 'en' ? 'en' : 'zh-Hant';
  languageToggle.setAttribute('aria-label', other === 'en' ? 'Switch the interface to English' : '將介面切換為中文');
  languageToggle.addEventListener('click', () => {
    settings.language = other; settings.labelLanguage = other; saveSettings(settings);
    const url = new URL(location.href); url.searchParams.delete('lang');
    if (url.href === location.href) location.reload(); else location.replace(url.href);
  });
  $('start').addEventListener('click', onStart);
  $('demo-start').addEventListener('click', onDemo);
  $('camera-stop').addEventListener('click', onStop);
  $('camera-switch').addEventListener('click', onSwitch);
  $('camera-switch-mobile').addEventListener('click', onSwitch);
  const drawer = $('drawer'), toggle = $('settings-toggle'), backdrop = $('drawer-backdrop');
  const mobileLayout = matchMedia('(max-width:900px), (pointer:coarse) and (max-width:1100px)');
  const stageColumn = document.querySelector('.stagecol'), mobileControls = document.querySelector('.mobile-controls');
  let focusFrame = 0, lastFocused = document.activeElement;
  document.addEventListener('focusin', e => { lastFocused = e.target; });
  function focusableItems() {
    return [...drawer.querySelectorAll('button,input,select,a[href],summary,[tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  }
  function openDrawer(open, { restoreFocus = true } = {}) {
    cancelAnimationFrame(focusFrame);
    open = !!open && mobileLayout.matches;
    drawer.classList.toggle('open', open); backdrop.classList.toggle('open', open);
    document.body.classList.toggle('drawer-open', open); toggle.setAttribute('aria-expanded', String(open));
    drawer.inert = mobileLayout.matches && !open;
    stageColumn.inert = mobileControls.inert = open;
    if (mobileLayout.matches) drawer.setAttribute('role', 'dialog'); else drawer.removeAttribute('role');
    if (open) drawer.setAttribute('aria-modal', 'true'); else drawer.removeAttribute('aria-modal');
    if (open) focusFrame = requestAnimationFrame(() => $('settings-close').focus({ preventScroll: true }));
    else if (restoreFocus && mobileLayout.matches) toggle.focus({ preventScroll: true });
  }
  function reconcileLayout() {
    // CSS may hide and blur a control before the media-query change event runs.
    const active = document.activeElement === document.body ? lastFocused : document.activeElement;
    const inDrawer = drawer.contains(active), inControls = mobileControls.contains(active);
    openDrawer(false, { restoreFocus: false });
    if (mobileLayout.matches && inDrawer) toggle.focus({ preventScroll: true });
    else if (!mobileLayout.matches && (active === $('settings-close') || inControls)) focusableItems()[0]?.focus({ preventScroll: true });
  }
  mobileLayout.addEventListener('change', reconcileLayout);
  reconcileLayout();
  toggle.addEventListener('click', () => openDrawer(!drawer.classList.contains('open')));
  $('settings-close').addEventListener('click', () => openDrawer(false));
  backdrop.addEventListener('click', () => openDrawer(false));
  document.addEventListener('keydown', e => {
    if (!drawer.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); openDrawer(false); }
    if (e.key === 'Tab' && mobileLayout.matches) {
      const items = focusableItems();
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
    }
  });
  sync();
  // The calibration starts closed, except for a viewer who has already fitted the head or asked for the read-out.
  $('advanced').open = ['fs', 'fw', 'fh', 'fd', 'fx', 'fy', 'fz', 'showdata'].some(key => settings[key] !== DEFAULTS[key]);
  return { sync, openDrawer, status(text, cls = '', showOnStage = false) {
    $('status').textContent = text; $('status').className = cls; $('session-note').textContent = text;
    $('intro-note').textContent = text;
    $('live-status').textContent = text; $('live-status').hidden = !showOnStage || !$('intro').hidden;
  } };
}
