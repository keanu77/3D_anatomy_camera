# Changes

Versions follow the number in `package.json` and in `/version.json` on the site.

## 3.1.0 (2026-11-13)

### Added

- **Interface in Traditional Chinese or English.** It follows the browser language; the button in the header changes it, and a link can ask for one with `?lang=en` or `?lang=zh`. In English, structures are named by their source's own English names. The words in the anatomy name tables and the quoted reference text are unchanged.
- A camera that is unplugged, or whose permission is withdrawn, is released and reported, and the app returns to the start screen.

### Fixed

- Dragging any slider while the camera was running discarded every tracking result until the slider was released. Tracking is now reset only when what is tracked changes.
- Pausing now tracks the frozen frame with every tracker in use and shows that frame's own pose. Before, a throttled tracker could keep a result up to 125 ms old, and the body kept its earlier smoothed pose.
- With a region enlarged and no hand in view, the lens was drawn away from the pointer (about 200 px at 2.1x). It now stays under it.
- A close-up of a hand made the pose model report a small figure inside the hand, and forearm bones and muscles were drawn on it, for example along a finger. A pose whose arms are less than half the length of the hand that is tracked is now refused, and the app asks for the elbow, wrist and hand to be in view.
- An enlarged region no longer pulses. The enlargement followed every tremble of the tracked landmarks and dropped out whenever tracking did for a frame (between 1.44x and 1.91x on a hands close-up). It now changes only when the region really moves or changes size, eases to the new value, and is kept for 1.2 s when tracking drops out.
- Redrawing a paused picture no longer steps the automatic performance mode down on the frame rate measured before the pause.
- Name labels are drawn at the display's pixel density. On a phone with a density of 3 they were drawn at one third of it and were hard to read.
- `version.json` of a release build records the commit time, so rebuilding the same commit gives the same bytes and `npm run verify:deploy` can be repeated from a clean checkout.

### Changed

- The scene starts loading while the camera permission prompt is open. With a 1.5 s prompt on a 5 Mbit/s link, the live view appeared after 4.3 s instead of 5.8 s.

## 3.0.0 (2026-11-13)

First public release as **3D anatomy camera**. Head and hand geometry, tracking, rendering, labels and the interface were rebuilt independently from public source datasets; see `NOTES.rebuild.md`. Skeletal, muscle, joint, neural and selected organ layers; region focus; picking of individual source surfaces with reference text; pause, turn and zoom; background tracking in a worker; a demo that needs no camera.
