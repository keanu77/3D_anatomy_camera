# Changes

Versions follow the number in `package.json` and in `/version.json` on the site.

## 3.3.0 (2026-11-13)

### Added

- **The carpal bones are named one by one.** In the forearm and wrist region each tracked hand carries the names of its eight carpal bones, each at its own bone, in place of the single wrist label. With one side chosen, that hand is named bone by bone and the other keeps its one label.
- **The metatarsals are named one by one** in the foot region, beside the seven tarsal bones that already were. The fourteen toe bones stay one label per side.
- **A button over the picture goes back to the start screen**, in the demo and with the camera. In the demo the only way back was "Stop camera" in the settings, inside the drawer on a phone.

### Changed

- The lower-leg and foot regions ask for the hips down to the feet in view. The pose model finds no body in a picture of ankles and feet alone, and the foot region used to ask for exactly that; the enlargement of the region does the closing in.
- Leaving the demo says so, instead of reporting a stopped camera.
- **The standing figures on the start screen are upright pictures.** In a 3:2 frame the figure used a third of the width and was shown at about 240 px on a desktop; drawn 600 by 900 it fills its picture and is shown at more than half the height of the start screen.
- **Settings: one list of presets, and the fine adjustments folded away.** The system presets and the layer presets are one group under "What to show", above the single layers. The layer preset that was also called "Whole body" is "All layers"; "Whole body" now names the region choice alone. Mixed reality, head fit and tracking data are one section, "Advanced", closed until asked for and open again for a viewer who has moved one of its controls. The panel is 2378 px long on a desktop instead of 3143 px.

## 3.2.1 (2026-11-13)

### Added

- The credits link to the public source repository. The credit to X-Ray Mirror stays; its link to the post on X is removed from the page.

### Fixed

- **Lite mode keeps tracking the hands beside a body.** It dropped the hand tracker whenever a body layer was on. That is the mode a phone settles in, and there nothing contradicted the small figure the pose model sees in a close hand: the whole of it was drawn on the hand, and the forearm and wrist region showed no hand bones. The hands are now tracked four times a second in that case. With the fingertip lens, lite mode still gives the body up for the hands.
- A pose that the tracked hands contradict stays refused for one second after the last contradiction. Before, it was drawn in every result where the hand tracker missed the close hand, and a real arm near the limit flickered on and off.

## 3.2.0 (2026-11-13)

### Changed

- **One visual system.** Colours, corners, text sizes and timings are named once in `src/style.css` and used by name in both stylesheets; the inspector over the picture no longer has a palette, a button shape and a focus ring of its own. One accent colour, one corner scale (6 and 10 px), one keyboard focus ring. Unit tests keep the stylesheets to the tokens.
- **No text below 13 px.** Controls are 14 px, notes 13 px, a structure's description 16 px. Before, most of the interface was 12 px and some of it 8 to 11 px.
- **The start screen shows the model.** It covers the whole stage column, with pictures of the model beside the words, and says what the site is instead of repeating its name. Three stills share the frame: the skull and hand bones, the muscles of the whole body, and the brain, spinal cord and peripheral nerves. They turn over every five seconds until one is chosen from the row under them, and stand still under reduced motion. The pictures are drawn from the app by `scripts/make-intro-poster.mjs`.
- **An upright phone gets an upright demo.** The head demo stands 3:4 on a portrait phone (it was a 4:3 strip a third of the screen high), with the head further back and the hands further out so they do not cover the skull. The 4:3 demo is unchanged.
- Buttons answer a press (they sink slightly) and change colour over 150 ms; the settings panel opens over 200 ms. The start screen's words rise once, on the first visit only. Reduced motion turns all of it off.
- The side choice and "enlarge the focused region" are shown only while a region is in focus, instead of standing greyed out.
- The header mark, the favicon and the web app manifest use the interface's accent and ground colours.

### Fixed

- On a 320 px wide screen the name in the header wrapped onto two lines and its top was cut off.

## 3.1.0 (2026-11-13)

### Added

- **Interface in Traditional Chinese or English.** It follows the browser language; the button in the header changes it, and a link can ask for one with `?lang=en` or `?lang=zh`. In English, structures are named by their source's own English names. The words in the anatomy name tables and the quoted reference text are unchanged.
- A camera that is unplugged, or whose permission is withdrawn, is released and reported, and the app returns to the start screen.

### Fixed

- Dragging any slider while the camera was running discarded every tracking result until the slider was released. Tracking is now reset only when what is tracked changes.
- Pausing now tracks the frozen frame with every tracker in use and shows that frame's own pose. Before, a throttled tracker could keep a result up to 125 ms old, and the body kept its earlier smoothed pose.
- With a region enlarged and no hand in view, the lens was drawn away from the pointer (about 200 px at 2.1x). It now stays under it.
- A close-up of a hand made the pose model report a small figure inside the hand, and forearm bones and muscles were drawn on it, for example along a finger. A pose whose arms, as they appear in the picture, are less than half the length of the hand that is tracked is now refused, and the app asks for the elbow, wrist and hand to be in view.
- An enlarged region no longer pulses. The enlargement followed every tremble of the tracked landmarks and dropped out whenever tracking did for a frame (between 1.44x and 1.91x on a hands close-up). It now changes only when the region really moves or changes size, eases to the new value, and is kept for 1.2 s when tracking drops out.
- Redrawing a paused picture no longer steps the automatic performance mode down on the frame rate measured before the pause.
- Name labels are drawn at the display's pixel density. On a phone with a density of 3 they were drawn at one third of it and were hard to read.
- `version.json` of a release build records the commit time, so rebuilding the same commit gives the same bytes and `npm run verify:deploy` can be repeated from a clean checkout.

### Changed

- Choosing a region no longer rewrites the layer selection. It switches on the layers the region needs and the name labels, and leaves every layer the viewer chose as it was: before, picking a region on the start screen switched off the skull, brain or any other layer set a moment earlier, and returning to the whole body did not bring them back. A head layer left on is therefore still drawn beside the region.
- The scene starts loading while the camera permission prompt is open. With a 1.5 s prompt on a 5 Mbit/s link, the live view appeared after 4.3 s instead of 5.8 s.

## 3.0.0 (2026-11-13)

First public release as **3D anatomy camera**. Head and hand geometry, tracking, rendering, labels and the interface were rebuilt independently from public source datasets; see `NOTES.rebuild.md`. Skeletal, muscle, joint, neural and selected organ layers; region focus; picking of individual source surfaces with reference text; pause, turn and zoom; background tracking in a worker; a demo that needs no camera.
