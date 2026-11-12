// Copy callback-owned segmentation data without retaining a MediaPipe mask.
// MediaPipe 0.10.14's GPU-to-array helper reads document on Mac, which is absent
// in workers (upstream issue #5631). Use its public texture/canvas APIs instead.
export function copyTrackingMask(mask) {
  if (!mask) return null;
  const { width, height } = mask;
  if (mask.hasFloat32Array()) return { width, height, data: new Float32Array(mask.getAsFloat32Array()) };
  if (mask.hasUint8Array()) return { width, height, data: Float32Array.from(mask.getAsUint8Array(), value => value / 255) };
  const gl = mask.canvas?.getContext('webgl2');
  if (!gl) throw new Error('無法讀取身體遮罩。');
  const previous = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  const packBuffer = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
  const packSettings = [gl.PACK_ALIGNMENT, gl.PACK_ROW_LENGTH, gl.PACK_SKIP_ROWS, gl.PACK_SKIP_PIXELS].map(key => [key, gl.getParameter(key)]);
  const framebuffer = gl.createFramebuffer();
  try {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mask.getAsWebGLTexture(), 0);
    if (gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('身體遮罩尚未準備完成。');
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    for (const [key] of packSettings) gl.pixelStorei(key, key === gl.PACK_ALIGNMENT ? 1 : 0);
    // The graph may export normalized byte or float textures. Use the attached
    // texture's advertised read format/type, including WebKit's RGBA path.
    const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
    const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
    const channels = format === gl.RGBA ? 4 : format === gl.RED ? 1 : 0;
    if (!channels || (type !== gl.FLOAT && type !== gl.UNSIGNED_BYTE)) throw new Error('瀏覽器不支援此身體遮罩格式。');
    const pixels = type === gl.FLOAT ? new Float32Array(width * height * channels) : new Uint8Array(width * height * channels);
    gl.readPixels(0, 0, width, height, format, type, pixels);
    const data = new Float32Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = pixels[i * channels] / (type === gl.UNSIGNED_BYTE ? 255 : 1);
    return { width, height, data };
  } finally {
    for (const [key, value] of packSettings) gl.pixelStorei(key, value);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, packBuffer);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous);
    gl.deleteFramebuffer(framebuffer);
  }
}
