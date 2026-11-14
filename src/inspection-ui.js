import { formatAnatomyName } from './anatomy-names.js';
import { FIELDS, sourceUrl } from './structure-info.js';
import { t, getLanguage } from './i18n.js';
import './inspection.css';

/**
 * A sibling overlay: readable text never inherits the stage's mirror or reveal mask.
 * getInfo(part) -> { state: 'loading' | 'error' | 'ready', entry } supplies the reference text of a part.
 */
export function createInspectionUI({ stage, onEnable = () => {}, onChoose = () => {}, onClear = () => {}, getInfo = () => ({ state: 'ready', entry: null }) }) {
  if (!stage?.parentElement) throw new Error('Inspection UI requires an attached stage.');
  const doc = stage.ownerDocument;
  const host = stage.parentElement;
  const hadHostClass = host.classList.contains('inspection-host');
  host.classList.add('inspection-host');
  function element(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(className, text) {
    const node = element('button', className, text); node.type = 'button'; return node;
  }
  const wrapper = element('section', 'inspection-ui');
  wrapper.setAttribute('aria-label', t('構造點選'));
  const tools = element('div', 'inspection-tools');
  // Freezing the picture sits at the foot of the picture, in the middle, under the thumb. The app owns the behaviour.
  const pause = button('stage-pause', t('暫停'));
  pause.id = 'pause-toggle'; pause.setAttribute('aria-pressed', 'false'); pause.setAttribute('aria-label', t('暫停畫面'));
  // The way back to the start screen stands over the picture: in the demo nothing else says how to leave it.
  const home = button('stage-home');
  home.id = 'home-button'; home.append(element('span', 'stage-home-text', t('回到首頁')));
  const toggle = button('inspection-toggle', t('點選構造'));
  toggle.id = 'inspection-toggle';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.setAttribute('aria-controls', 'inspection-help inspection-card');
  const help = element('div', 'inspection-help'); help.id = 'inspection-help';
  const status = element('p', 'inspection-status'); status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const retry = button('inspection-retry', t('重新載入'));
  help.append(status, retry); tools.append(toggle, help);
  // Put application status and inspector controls in the same layout flow. Their
  // previous independent stage/host coordinates overlap when the stage is centered.
  const liveStatus = stage.querySelector('#live-status');
  const liveStatusNext = liveStatus?.nextSibling;
  if (liveStatus) tools.prepend(liveStatus);

  const card = element('section', 'inspection-card'); card.id = 'inspection-card';
  card.setAttribute('aria-label', t('已選構造'));
  const top = element('div', 'inspection-card-top');
  const classification = element('p', 'inspection-classification');
  const clear = button('inspection-clear', t('清除')); clear.setAttribute('aria-label', t('清除選取'));
  top.append(classification, clear);
  const identity = element('div', 'inspection-identity');
  identity.setAttribute('aria-live', 'polite'); identity.setAttribute('aria-atomic', 'true');
  const title = element('h2', 'inspection-name');
  const english = element('p', 'inspection-english'); english.lang = 'en';
  const detail = element('p', 'inspection-detail');
  const source = element('p', 'inspection-source');
  identity.append(title, english, detail, source);
  const candidates = element('div', 'inspection-candidates');
  const candidateLabel = element('label', 'inspection-candidate-label');
  candidateLabel.htmlFor = 'inspection-candidates';
  const select = element('select', 'inspection-select'); select.id = 'inspection-candidates';
  candidates.append(candidateLabel, select);
  // Reference text is quoted in English from its source; the surrounding interface stays Chinese.
  const info = element('section', 'inspection-info'); info.setAttribute('aria-label', t('構造說明'));
  card.append(top, identity, candidates, info); wrapper.append(home, tools, card);
  // Pause lives on the picture itself, so it sits at the picture's foot however the picture is letterboxed.
  stage.append(pause); host.append(wrapper);

  let active = false, loading = false, error = '', selection = null, disposed = false;
  // In English the source's own name is the title; the Chinese display name is not shown beside it.
  function displayName(part) {
    const name = formatAnatomyName(part);
    if (getLanguage() !== 'en') return name;
    const details = [], side = { L: 'left', R: 'right', left: 'left', right: 'right' };
    if (typeof part.wholeMuscleName === 'string' && part.wholeMuscleName && part.wholeMuscleName !== part.name) details.push(`Part of: ${part.wholeMuscleName}`);
    if (part.mirrored) {
      const from = side[part.sourceSide || (typeof part.sourceName === 'string' ? part.sourceName.match(/\b(left|right)\b/i)?.[1].toLowerCase() : '')], shown = side[part.side];
      details.push(from && shown ? `The ${shown} hand is drawn as a mirror image of the ${from}-hand reference model` : 'Drawn as a mirror image of the source reference model');
    }
    return { title: name.english || t(name.title), english: '', kindLabel: t(name.kindLabel), sideLabel: t(name.sideLabel), detail: name.detail ? details.join('. ') : '' };
  }
  const cleanup = [];
  function listen(node, type, callback) {
    node.addEventListener(type, callback); cleanup.push(() => node.removeEventListener(type, callback));
  }
  function render() {
    toggle.setAttribute('aria-pressed', String(active));
    wrapper.classList.toggle('inspection-active', active);
    help.hidden = !active;
    retry.hidden = !error || loading;
    help.setAttribute('aria-busy', String(loading));
    help.classList.toggle('inspection-error', !!error);
    status.textContent = loading ? t('正在載入可點選的肌肉與骨骼…') : t(error) || t('點一下肌肉或骨頭查看名稱；點空白處清除。');
    card.hidden = !active || !selection || loading || !!error;
  }
  function renderInfo(part) {
    const fields = FIELDS[part.kind];
    info.replaceChildren(); info.hidden = !fields;
    if (!fields) return;
    const { state, entry } = getInfo(part);
    if (!entry) {
      const note = t({ loading: '正在載入構造說明…', error: '構造說明載入失敗，請再點選一次重試。' }[state] || '這個構造目前沒有說明資料。');
      info.append(element('p', 'inspection-info-note', note)); return;
    }
    const list = element('dl', 'inspection-info-list'); list.lang = 'en';
    for (const { key, label } of fields) {
      if (entry[key]) list.append(element('dt', '', label), element('dd', '', entry[key]));
    }
    const credit = element('p', 'inspection-info-source'), link = element('a', '', `Wikipedia: ${entry.title}`);
    link.href = sourceUrl(entry); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.lang = 'en';
    credit.append(t('來源：'), link, t('（CC BY-SA 4.0）'));
    info.append(list, credit);
  }
  function showSelection(value) {
    if (disposed) return;
    const parts = Array.isArray(value?.parts) ? value.parts : [];
    if (!active || !parts.length) { selection = null; select.replaceChildren(); render(); return; }
    const selectedIndex = Number.isInteger(value.selectedIndex) && value.selectedIndex >= 0 && value.selectedIndex < parts.length ? value.selectedIndex : 0;
    selection = { parts: [...parts], selectedIndex };
    const part = parts[selectedIndex], name = displayName(part);
    classification.textContent = `${name.kindLabel} · ${name.sideLabel}`;
    title.textContent = name.title;
    english.textContent = name.english; english.hidden = !name.english || name.title === name.english;
    detail.textContent = name.detail || ''; detail.hidden = !name.detail;
    source.textContent = `${t('解剖 ID：')}${typeof part.id === 'string' && part.id ? part.id : t('未提供')}`;
    if (part.mirrored && typeof part.sourceId === 'string' && part.sourceId) {
      source.textContent += `${t(' · 參考模型 ID：')}${part.sourceId}`;
    }
    if (part.mirrored && typeof part.sourceName === 'string' && part.sourceName) {
      source.textContent += `（${part.sourceName}）`;
    }
    renderInfo(part);
    select.replaceChildren();
    parts.forEach((candidate, index) => {
      const label = displayName(candidate);
      const option = element('option', '', `${label.title} · ${label.sideLabel}`);
      option.value = String(index); select.append(option);
    });
    select.value = String(selectedIndex);
    candidates.hidden = parts.length < 2;
    candidateLabel.textContent = getLanguage() === 'en' ? `${parts.length} structures overlap here; choose one to view` : `此處重疊 ${parts.length} 個構造，切換查看`;
    render();
  }
  function setActive(value) {
    if (disposed) return;
    active = !!value;
    if (!active) { selection = null; error = ''; select.replaceChildren(); }
    render();
  }
  function clearSelection(restoreFocus = false) {
    if (!selection) return;
    showSelection(null); onClear();
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }
  listen(pause, 'click', () => stage.dispatchEvent(new CustomEvent('pausetoggle')));
  listen(home, 'click', () => stage.dispatchEvent(new CustomEvent('gohome')));
  listen(toggle, 'click', () => { setActive(!active); onEnable(active); });
  listen(clear, 'click', () => clearSelection(true));
  listen(select, 'change', () => {
    const index = Number(select.value);
    if (!selection || !Number.isInteger(index) || index < 0 || index >= selection.parts.length) return;
    showSelection({ ...selection, selectedIndex: index }); onChoose(index);
  });
  listen(retry, 'click', () => { error = ''; loading = true; render(); onEnable(true); });
  listen(wrapper, 'keydown', event => {
    if (event.key !== 'Escape' || !active) return;
    event.preventDefault(); event.stopPropagation();
    if (selection) clearSelection(true);
    else { setActive(false); onEnable(false); toggle.focus({ preventScroll: true }); }
  });
  // The UI may be adjacent to other delegated picking handlers; keep its gestures local.
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'touchstart', 'touchend']) {
    listen(wrapper, type, event => event.stopPropagation());
    listen(pause, type, event => event.stopPropagation());
  }
  // The card keeps above the pause: tell the CSS how far the picture's foot stands from the host's.
  const placeFoot = () => {
    const gap = host.getBoundingClientRect().bottom - stage.getBoundingClientRect().bottom;
    host.style.setProperty('--stage-foot', `${Math.max(0, Math.round(gap))}px`);
  };
  const footObserver = new ResizeObserver(placeFoot); footObserver.observe(stage); footObserver.observe(host);
  cleanup.push(() => { footObserver.disconnect(); host.style.removeProperty('--stage-foot'); });
  placeFoot();
  render();
  return {
    setActive,
    setLoading(value) { if (disposed) return; loading = !!value; if (loading) error = ''; render(); },
    showSelection,
    /** Draw the selected part's reference text again, once it has arrived. */
    refreshInfo() { if (!disposed && selection) showSelection(selection); },
    setError(message) { if (disposed) return; error = typeof message === 'string' ? message : ''; if (error) loading = false; render(); },
    dispose() {
      if (disposed) return;
      disposed = true; for (const remove of cleanup) remove();
      if (liveStatus) stage.insertBefore(liveStatus, liveStatusNext?.parentNode === stage ? liveStatusNext : null);
      wrapper.remove(); pause.remove();
      if (!hadHostClass) host.classList.remove('inspection-host');
    },
  };
}
