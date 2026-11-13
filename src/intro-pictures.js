/**
 * The start screen has several pictures of the model in one frame. They turn over on a timer until the viewer
 * picks one; from then on the choice stands. `show(index)` puts a picture on show, `ready(index)` says whether
 * it has loaded: a picture still on its way is waited for, never faded to as an empty frame.
 */
export function createPictureRotation({ count, show, ready = () => true, delay = 5000, timers = globalThis }) {
  let index = 0, timer = 0, running = false, chosen = false;
  function wait() {
    timers.clearTimeout(timer);
    timer = running && !chosen && count > 1 ? timers.setTimeout(turn, delay) : 0;
  }
  function turn() {
    const next = (index + 1) % count;
    if (ready(next)) { index = next; show(index); }
    wait();
  }
  return {
    start() { if (!running) { running = true; wait(); } },
    stop() { running = false; wait(); },
    choose(next) {
      if (!Number.isInteger(next) || next < 0 || next >= count) return;
      chosen = true; index = next; show(index); wait();
    },
    get index() { return index; },
  };
}

/** Binds the rotation to the page: the stacked pictures and the row of buttons that names and chooses them. */
export function bindIntroPictures({ pictures, buttons, still = false }) {
  function show(index) {
    pictures.forEach((picture, at) => {
      picture.classList.toggle('current', at === index);
      if (at === index) picture.removeAttribute('aria-hidden'); else picture.setAttribute('aria-hidden', 'true');
    });
    buttons.forEach((button, at) => button.setAttribute('aria-pressed', String(at === index)));
  }
  const rotation = createPictureRotation({ count: pictures.length, show, ready: index => pictures[index].complete && pictures[index].naturalWidth > 0 });
  buttons.forEach((button, at) => button.addEventListener('click', () => rotation.choose(at)));
  show(0);
  // With reduced motion nothing moves unasked: the pictures change only when the viewer chooses.
  return { start: () => { if (!still) rotation.start(); }, stop: rotation.stop };
}
