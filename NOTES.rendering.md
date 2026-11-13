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

- **Carpal bones and metatarsals are named one by one.** The palm mesh already carries its twelve source bones as parts in the head's individual bundle. In the forearm and wrist region, with the hand layer and the labels on, the region asks the inspector for that bundle (`also` on the part filter) and `carpalLabels` in `src/regions.js` turns the centroids of the eight carpal parts into labels, each projected through the palm mesh's own matrix; they replace the single wrist label of that hand. A left hand is the mirrored right-hand geometry and is named as a left hand through `displayedPart`, which moved to `src/displayed-part.js` so that `regions.js`, part of the start bundle, does not import the renderer. With one side chosen, only that hand is named bone by bone. Outside the region the hand keeps its five overview labels. In the foot region the five metatarsals left the collapsed families and are named individually; the fourteen toe bones stay one label per side. The names are those of the existing table; none was added.
- **A way back to the start screen.** `#home-button` stands at the top left of the stage column, built with the inspector's other two controls and wired through a `gohome` event on the stage, as pausing is. It calls the same `stop()` as the settings' button; leaving the demo reports that, not a stopped camera. In English on a screen of 360 px or less the two other controls leave no room for its word, so the arrow stands alone and the name is read out.

- **Start-screen pictures have their own shapes.** `scripts/make-intro-poster.mjs` gives each picture a `size`: the head and hands stay 900 by 600, the two standing figures are 600 by 900 and drawn on a stage of that size, which the figure fills. The three share one grid cell; `align-self: center` keeps the wide one level with the words in the frame the upright ones need. `design.spec.js` measures how much of each picture the model spans (over 80% of the height, over 55% of the width) and that a standing figure is shown at more than half the start screen's height on a desktop.
- **Settings panel order.** Region focus; what to show (presets, single layers, name labels, coverage); appearance; advanced; camera and performance; credits. The presets are two rows of one group (`role=group`, "快速組合"): the four systems, then seven single views. `#advanced` is a `<details>` holding mixed reality, head fit and tracking data. It opens at load when any of `real`, `feather`, `reveal`, `cut`, `showdata` or the seven fit values differs from its default, so nobody loses sight of an adjustment in use. Tests that operate those controls open it first (`openAdvanced` in `tests/e2e/helpers.js`). This is one reading of the direction agreed in the design round (merge the system and layer presets, rename the second "全身", fold the advanced blocks); the names and what counts as advanced are open to that round's review.

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
