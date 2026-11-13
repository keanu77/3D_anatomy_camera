import { describe, expect, test, vi } from 'vitest';
import { buildTime } from '../../scripts/build-time.mjs';

const sha = 'f5538b75fee0c493dd38e975d094a6380a8e5f6f';
const now = () => new Date('2030-01-02T03:04:05.000Z');

describe('time recorded in version.json', () => {
  test('two release builds of one commit record the same time, whenever they run', () => {
    const readCommitTime = vi.fn(() => '2026-11-13T07:16:40+08:00');
    const first = buildTime({ env: { BUILD_SHA: sha }, readCommitTime, now });
    const later = buildTime({ env: { BUILD_SHA: sha }, readCommitTime, now: () => new Date('2031-06-07T08:09:10.000Z') });
    expect(first.toISOString()).toBe('2026-11-12T23:16:40.000Z');
    expect(later.toISOString()).toBe(first.toISOString());
    expect(readCommitTime).toHaveBeenCalledWith(sha);
  });
  test('SOURCE_DATE_EPOCH takes precedence over the commit', () => {
    const readCommitTime = vi.fn(() => '2026-11-13T07:16:40+08:00');
    expect(buildTime({ env: { SOURCE_DATE_EPOCH: '1700000000', BUILD_SHA: sha }, readCommitTime, now }).toISOString()).toBe('2023-11-14T22:13:20.000Z');
    expect(readCommitTime).not.toHaveBeenCalled();
  });
  test('a local build, or a release build outside a checkout, records the present', () => {
    expect(buildTime({ env: {}, readCommitTime: () => { throw new Error('unused'); }, now })).toEqual(now());
    expect(buildTime({ env: { BUILD_SHA: sha }, readCommitTime: () => { throw new Error('not a git repository'); }, now })).toEqual(now());
    expect(buildTime({ env: { BUILD_SHA: sha }, readCommitTime: () => '', now })).toEqual(now());
  });
  test('malformed inputs fail instead of reaching git or being silently ignored', () => {
    const readCommitTime = vi.fn();
    expect(() => buildTime({ env: { BUILD_SHA: 'HEAD --output=elsewhere' }, readCommitTime, now })).toThrow('Invalid BUILD_SHA');
    expect(() => buildTime({ env: { SOURCE_DATE_EPOCH: 'yesterday' }, readCommitTime, now })).toThrow('Invalid SOURCE_DATE_EPOCH');
    expect(readCommitTime).not.toHaveBeenCalled();
  });
});
