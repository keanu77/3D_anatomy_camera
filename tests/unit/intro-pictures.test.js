import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPictureRotation } from '../../src/intro-pictures.js';

describe('start screen picture rotation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function rotation(options = {}) {
    const shown = [];
    return { shown, turn: createPictureRotation({ count: 3, delay: 5000, show: index => shown.push(index), ...options }) };
  }

  it('waits to be started, then shows each picture in turn and comes round to the first', () => {
    const { shown, turn } = rotation();
    vi.advanceTimersByTime(20000);
    expect(shown).toEqual([]);
    turn.start();
    vi.advanceTimersByTime(4999);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([1]);
    vi.advanceTimersByTime(10000);
    expect(shown).toEqual([1, 2, 0]);
    expect(turn.index).toBe(0);
  });

  it('shows the picture the viewer chose and never turns on its own again', () => {
    const { shown, turn } = rotation();
    turn.start();
    vi.advanceTimersByTime(5000);
    turn.choose(2);
    expect(shown).toEqual([1, 2]);
    vi.advanceTimersByTime(60000);
    turn.stop(); turn.start();
    vi.advanceTimersByTime(60000);
    expect(shown).toEqual([1, 2]);
    expect(turn.index).toBe(2);
  });

  it('ignores a choice that is not one of the pictures', () => {
    const { shown, turn } = rotation();
    turn.start();
    for (const wrong of [-1, 3, 1.5, NaN, '1', undefined]) turn.choose(wrong);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([1]);
  });

  it('holds still while stopped and carries on from the same picture', () => {
    const { shown, turn } = rotation();
    turn.start();
    vi.advanceTimersByTime(5000);
    turn.stop();
    vi.advanceTimersByTime(60000);
    expect(shown).toEqual([1]);
    turn.start(); turn.start();
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([1, 2]);
  });

  it('keeps the picture on show until the next one has loaded', () => {
    let loaded = false;
    const { shown, turn } = rotation({ ready: () => loaded });
    turn.start();
    vi.advanceTimersByTime(15000);
    expect(shown).toEqual([]);
    loaded = true;
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([1]);
  });

  it('never sets a timer for a single picture', () => {
    const { shown, turn } = rotation({ count: 1 });
    turn.start();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(shown).toEqual([]);
  });
});
