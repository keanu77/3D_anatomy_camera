# Independent renderer

構想受 Hashem Al-Ghaili 的 X-Ray Mirror 啟發，本專案的程式與資料為獨立製作
（[原貼文](https://x.com/HashemGhaili/status/2120202746121085321)）。

The renderer, tracking, labels and interface were rebuilt under R0–R6. Source
provenance, registration numbers, preserved assets and verification receipts
are in `NOTES.rebuild.md`.

## Coordinate and rendering contracts

- Head surfaces use canonical-face centimetres and a perspective camera. A
  screen similarity fit corrects the base projection; manual calibration acts
  afterward. The mandible rotates about its geometric condyle midpoint.
- Hands and body use stage pixels: X right, Y up, Z toward the viewer. Hand
  matrices implement exactly the same affine frames as `tools/hand_frame.py`.
  The left hand reflects the right-hand source geometry and retains provenance.
- Display reflection does not alter anatomical handedness. Focus and frozen
  gesture zoom transform the picture after reflection; picking inverts zoom.
- The body, head and hands have separate depth passes, also used by picking.
  X-ray is additive with bounded per-system gains, a bright rim and nonzero
  nerve base light. Solid surfaces use depth testing/writing. Dark masks and
  opacity preserve controllable video visibility.
- Plane clipping uses `dot(uToHead * position, plane.xyz) >= plane.w` in both
  shader and picking. Jaw labels evaluate the same transformed half-space.
  Lens masks are in display coordinates and also constrain picking/labels.
- `render-style.js` owns anatomy colors, gains, base light, rim curve, solid
  lighting, veil color and selection highlight. `style.css` owns interface
  color variables, layout and responsive controls.

## Interaction and resource ownership

Body, muscle, joint, nerve, peripheral and individual-detail bundles load only
when needed. Requests are deduplicated and cancelled by generation; stopping
cannot install a late response. The body loader owns its geometry and copied
segmentation veil, never a retained MediaPipe mask. Selected source surfaces
keep exact triangle ownership. Existing anatomy names and Wikipedia content
are unchanged.

`scene.js` retains one frame for a static demo, frozen inspection, settings
changes or asynchronously loaded details. Redraw callbacks are coalesced and
cannot start a second animation loop. Resize resets pixel-space filters only
when dimensions change. Stopping clears every rig, mask and selected surface.

Head/hand labels and body labels share the bounded two-column layout. Label
projection respects reflection, clipping, jaw motion and display zoom. The
independent demo is in `demo-pose.js`; it uses no camera and loads no tracker.

The label canvas is backed at the display's pixel density (at most 3, and about
four megapixels); layout stays in stage pixels. At density 1 the output is
unchanged. A disabled label layer is not cleared again on every frame.

Without a tracked fingertip the lens follows the pointer. The pointer is a
display position and is mapped back through the current zoom, so the lens stays
under it while a focused region is enlarged.

When a picture freezes, the head takes the frozen frame's measured pose at once
and redraws leave it there; before, each redraw moved it a little closer. The
scene starts loading as soon as Start is pressed, while the camera permission
prompt is still open; tracking models still wait for the answer.

## Verification

R4 passed 290 unit tests and 65 active browser cases, including source picking,
mirror, pause/orbit/pinch, focus, lazy loading, CSP and actual installed models.
R5 replaces the five skipped prototype comparisons with six project-owned
640×480 snapshots under `tests/e2e/snapshots`. The acceptance threshold remains
pixelmatch 0.1, includeAA false, changed ratio below 0.01.

The review board is kept locally at `tools/out/review/look.png`, together with
separate readability evidence. Emulator and synthetic pose checks do not
establish physical-device endurance, patient-specific accuracy or clinical
validation. The models follow rigid frames rather than biomechanical tissue
deformation; motion can separate adjacent segments.
