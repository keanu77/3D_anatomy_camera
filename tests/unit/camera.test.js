import { describe, expect, test, vi } from 'vitest';
import { createCamera } from '../../src/camera.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fakeStream(facing = 'user') {
  const track = { readyState: 'live', stop: vi.fn(function () { this.readyState = 'ended'; }), getSettings: () => ({ facingMode: facing }), applyConstraints: vi.fn(async () => {}) };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
function setup(getUserMedia) {
  const video = { pause: vi.fn(), play: vi.fn(async () => {}), srcObject: null, videoWidth: 640, videoHeight: 480 };
  const onChange = vi.fn();
  return { video, onChange, camera: createCamera({ video, mediaDevices: { getUserMedia }, onChange }) };
}

describe('camera stream ownership', () => {
  test('requests video only with the chosen performance constraints', async () => {
    const stream = fakeStream(); const getUserMedia = vi.fn(async () => stream);
    const { camera, video } = setup(getUserMedia);
    await camera.start('user', 'lite');
    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 480 }, height: { ideal: 360 } } });
    expect(video.srcObject).toBe(stream);
    expect(camera.getDiagnostics().liveTracks).toBe(1);
    camera.stop();
    expect(stream.track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(camera.getDiagnostics().running).toBe(false);
  });
  test('stops the old camera before requesting the replacement', async () => {
    const front = fakeStream(), rear = fakeStream('environment');
    const getUserMedia = vi.fn().mockResolvedValueOnce(front).mockImplementationOnce(async () => {
      expect(front.track.readyState).toBe('ended');
      return rear;
    });
    const { camera, onChange } = setup(getUserMedia);
    await camera.start(); await camera.switch();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ running: true, facing: 'environment', mirror: false }));
    expect(camera.getDiagnostics().liveTracks).toBe(1);
  });
  test('stops a late stream after the user cancels acquisition', async () => {
    const gate = deferred(), stream = fakeStream();
    const { camera, video } = setup(() => gate.promise);
    const pending = camera.start(); camera.stop(); gate.resolve(stream);
    expect(await pending).toBe(false);
    expect(stream.track.readyState).toBe('ended');
    expect(video.srcObject).toBeNull();
  });
  test('an older request cannot replace a newer live stream', async () => {
    const old = deferred(), first = fakeStream(), latest = fakeStream('environment');
    const getUserMedia = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce(latest);
    const { camera, video } = setup(getUserMedia);
    const pending = camera.start(); await camera.start('environment'); old.resolve(first);
    expect(await pending).toBe(false);
    expect(first.track.readyState).toBe('ended');
    expect(latest.track.readyState).toBe('live');
    expect(video.srcObject).toBe(latest);
  });
  test('releases an acquired stream if video playback fails', async () => {
    const stream = fakeStream(); const { camera, video } = setup(async () => stream);
    video.play.mockRejectedValueOnce(new Error('Playback blocked'));
    await expect(camera.start()).rejects.toThrow('Playback blocked');
    expect(stream.track.readyState).toBe('ended');
    expect(video.srcObject).toBeNull();
    expect(camera.getDiagnostics()).toMatchObject({ running: false, busy: false });
  });
  test('recovers the original camera when switching is rejected', async () => {
    const front = fakeStream(), recovered = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValueOnce(front).mockRejectedValueOnce(new Error('Rear unavailable')).mockResolvedValueOnce(recovered);
    const { camera, video } = setup(getUserMedia);
    await camera.start();
    await expect(camera.switch()).rejects.toThrow('Rear unavailable');
    expect(front.track.readyState).toBe('ended');
    expect(video.srcObject).toBe(recovered);
    expect(camera.getDiagnostics()).toMatchObject({ running: true, facing: 'user', busy: false });
  });
  test('uses the actual camera facing reported by the browser', async () => {
    const { camera, onChange } = setup(async () => fakeStream('user'));
    await camera.start('environment');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ facing: 'user', mirror: true }));
  });
  test('does not reopen a camera when the user stops during a failed switch', async () => {
    const rear = deferred(), front = fakeStream(), unintended = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValueOnce(front).mockImplementationOnce(() => rear.promise).mockResolvedValueOnce(unintended);
    const { camera, video } = setup(getUserMedia);
    await camera.start();
    const switching = camera.switch(); camera.stop(); rear.reject(new Error('Rear unavailable'));
    await expect(switching).rejects.toThrow('Rear unavailable');
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(camera.getDiagnostics().running).toBe(false);
    expect(video.srcObject).toBeNull();
  });
});
