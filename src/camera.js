export const PROFILES = Object.freeze({ high: { width: 1280, height: 720 }, balanced: { width: 640, height: 480 }, lite: { width: 480, height: 360 } });
export function createCamera({ video, onChange = () => {}, onEnded = () => {}, mediaDevices = globalThis.navigator?.mediaDevices }) {
  let stream = null, facing = 'user', generation = 0, profile = 'balanced', busy = false;
  function stop() {
    generation++;
    if (stream) for (const track of stream.getTracks()) track.stop();
    stream = null; busy = false;
    video.pause(); video.srcObject = null;
    onChange({ running: false, facing, mirror: facing === 'user' });
  }
  async function start(nextFacing = facing, nextProfile = profile) {
    stop();
    const current = ++generation;
    busy = true;
    if (!mediaDevices?.getUserMedia) { busy = false; throw new Error('需要 HTTPS 與支援攝影機的瀏覽器。'); }
    const size = PROFILES[nextProfile] || PROFILES.balanced;
    let acquired;
    try {
      acquired = await mediaDevices.getUserMedia({ audio: false, video: {
        facingMode: { ideal: nextFacing }, width: { ideal: size.width }, height: { ideal: size.height },
      } });
      if (current !== generation) { acquired.getTracks().forEach(t => t.stop()); return false; }
      stream = acquired; video.srcObject = stream;
      // An unplugged camera or a withdrawn permission ends the track without any call from here.
      for (const track of acquired.getVideoTracks()) {
        track.addEventListener('ended', () => { if (stream === acquired) { stop(); onEnded(); } }, { once: true });
      }
      await video.play();
      if (current !== generation) { acquired.getTracks().forEach(t => t.stop()); return false; }
      const actual = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
      facing = actual === 'user' || actual === 'environment' ? actual : nextFacing;
      profile = nextProfile; busy = false;
      onChange({ running: true, facing, mirror: facing === 'user', width: video.videoWidth, height: video.videoHeight });
      return true;
    } catch (error) {
      acquired?.getTracks().forEach(t => t.stop());
      if (current === generation) { stream = null; video.srcObject = null; busy = false; }
      throw error;
    }
  }
  async function switchCamera() {
    if (busy) return false;
    const previous = facing;
    let requestedGeneration;
    try {
      const pending = start(facing === 'user' ? 'environment' : 'user');
      requestedGeneration = generation;
      return await pending;
    }
    catch (error) {
      if (generation !== requestedGeneration) throw error;
      try { await start(previous); } catch {}
      throw error;
    }
  }
  async function setProfile(next) {
    profile = next;
    const track = stream?.getVideoTracks()[0];
    if (track?.applyConstraints) {
      const p = PROFILES[next] || PROFILES.balanced;
      await track.applyConstraints({ width: { ideal: p.width }, height: { ideal: p.height } });
    }
  }
  return { start, stop, switch: switchCamera, setProfile,
    getDiagnostics: () => ({ running: !!stream, facing, busy, profile, liveTracks: stream?.getTracks().filter(t => t.readyState === 'live').length || 0 }) };
}
