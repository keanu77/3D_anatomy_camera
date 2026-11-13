# Background tracking and mobile controls

Version 2.2 keeps the pinned MediaPipe 0.10.14 models and anatomical assets. The change separates synchronous inference from the interface thread and fixes mobile control state.

## Execution and ownership

- `tracking-core.js` owns the existing lazy model lifecycle, per-tracker throttling, GPU/CPU fallback and result cache. `trackers.js` selects a worker when Worker, OffscreenCanvas and ImageBitmap capture are available; initialization failures use the main-thread compatibility path.
- `tracking-worker.js` is a classic worker because the pinned WASM loader uses `importScripts`. Vite bundles its dynamic imports into one IIFE. Asset URLs resolve against the application's base path; models, WASM and scripts remain same-origin. No CSP relaxation or image-upload endpoint was added.
- ImageBitmap capture and inference share one slot. Frames arriving while occupied are skipped rather than queued. The worker closes transferred bitmaps in `finally`; the client also closes local/detached handles after completion or cancellation.
- Stop, camera switches, visibility changes and layer changes invalidate older generations. Old results, failures and status messages cannot revive the stopped session. Reset during bootstrap does not submit old model requirements under a new generation. Disposal terminates the worker and settles pending requests.
- Stop releases camera tracks immediately. A previously submitted worker frame may finish locally, but its result is ignored. Loaded models remain cached until page disposal. Background operation is not server-side processing.
- Cumulative inference counts include any already-submitted frame that finishes after cancellation, without accepting its tracking or error state. With all tracking layers disabled, empty results still clear/render the scene without creating a model engine or capturing frames.
- Returning to a visible page or completing a camera switch requests fresh preparation, including when bootstrap was interrupted. A worker transport failure blocks detection until explicit compatibility-path preparation succeeds, preventing a silent empty tracking session.
- Pose masks are copied while the MediaPipe callback is active and transferred as owned Float32 data. No callback-owned MPMask is retained. The renderer briefly caches only its drawn veil canvas.

The [official Pose guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js) documents synchronous inference and recommends workers to avoid blocking the interface. This change improves event handling; it does not establish a higher model inference rate or eliminate GPU contention.

## GPU mask compatibility

An actual positive-Pose test reproduced the Mac worker error `Cannot use 'in' operator to search for 'ontouchend' in undefined`. The pinned package's GPU-to-Float32 conversion probes `self.document`, which does not exist in a worker. This matches [upstream issue 5631](https://github.com/google-ai-edge/mediapipe/issues/5631).

Direct GPU inspection also found that the current graph can return a normalized RGBA byte texture. Reading that texture as either RED/FLOAT (the upstream helper's path) or RGBA/FLOAT produced `INVALID_OPERATION` and zero-filled output in the tested Chromium/SwiftShader environment. This means a detected pose alone is insufficient evidence of a working body veil.

`tracking-mask.js` uses public mask texture/canvas accessors, attaches the texture to a temporary read framebuffer, and queries its advertised implementation read format/type. It supports RED/RGBA float or unsigned-byte output, normalizes bytes, extracts the red channel and restores framebuffer, pixel-pack buffer and all four pixel-pack settings in `finally`. CPU arrays are copied directly. Both worker and compatibility paths use this conversion.

The actual 1000×667 official Pose fixture produced 33 landmarks, 44,966 mask pixels above 0.5, values in [0,1], and zero WebGL error after the fix. The original helper returned all zeros plus error 1282 in that same check. This is a fixture/runtime observation, not an anatomical or clinical accuracy measurement. The positive browser tests now require visible veil pixels as well as detected body parts; only numeric results are retained, never fixture screenshots.

## Mobile controls

- Preset cycling derives its position from current layer selections, including direct links and manual preset changes. Custom selections restart at the first preset.
- X-ray/Solid buttons expose their selected state with `aria-pressed`.
- The mobile settings drawer uses dialog semantics and native background inertness, keeps keyboard focus inside while open, restores focus on dismissal, and reconciles focus when crossing desktop/mobile layout boundaries. Three focused browser cases cover these interactions.

## Validation limits

Automated checks use Chromium, synthetic camera video, official image-derived fixtures and mobile emulation. Worker fallback retains synchronous inference on unsupported environments. Physical Safari/Android support, thermal endurance, sustained frame rate and person-specific anatomical alignment still require device testing. The background worker does not add muscle deformation, joint articulation or clinical calibration.

## Body landmark smoothing (v2.7)

The body trembled even on a still person: each pose landmark was blended with a fixed 0.6 weight per frame, which passes most tracker noise through. `src/one-euro.js` replaces it with a One Euro filter (Casiez et al., 2012): the cutoff is 0.5 Hz at rest and rises with speed (beta 0.03 per px/s on a 640-pixel reference), and depth uses a lower cutoff (0.25 Hz) because it is the noisiest output and tilts the torso frame. Time steps come from the real interval between pose results, so the behaviour does not depend on frame rate.

Measured with `tools/out/jitter.mjs` (the official still pose photo redrawn with pixel noise and sub-pixel shake, real pose model, software GL, 36 joint endpoints over 14 s): mean frame-to-frame movement 0.35 px before and 0.14 px after; mean RMS 0.99 px before and 0.65 px after. This is a synthetic noise source, not a camera; it shows the direction and rough size of the change, not what a given phone will do. Head and hand smoothing are unchanged.

Pause (`setPaused` in `src/main.js`) stops the video element and lets one more inference run on the frozen frame so the anatomy matches the picture, then stops tracking. `scene.refresh()` redraws that frame when a setting changes; the body keeps its smoothed pose and its last silhouette veil instead of filtering the same frame again.

## Review corrections after 3.0.0

Each item was reproduced before it was changed; the regression tests named here failed on 3.0.0.

- **Appearance controls no longer reset tracking.** Every settings change used to invalidate the frame in flight and block the next one until preparation returned. While a slider was dragged, 25 inferences ran in three seconds and none was drawn (55 were drawn in three idle seconds). Tracking is now reset only when the tracked set, the performance mode or the layer selection changes, or when a caller asks for it (start, camera switch, return to the page). A tracker that failed to load is offered again on a later change, no more often than its ten-second retry delay. Test: `worker.spec.js`, "dragging an appearance slider".
- **The frozen frame is tracked completely.** Balanced and lite modes throttle each tracker; a frozen frame that arrived early kept a face or hand result up to 125 ms old. The frozen frame now runs every tracker in use. The body also discarded the frozen frame's pose and kept the earlier smoothed one; it now takes that pose as measured, and redraws keep it. Tests: `pause.spec.js`, "every pause tracks the frozen frame"; `body-freeze.test.js`.
- **No performance verdict while paused.** Redrawing a paused picture reported the frame rate measured before it froze, and the automatic mode stepped down on it, changing camera constraints under a frozen picture. Verdicts stop while paused and measurement restarts on resume. Test: `pause.spec.js`, "redrawing a paused picture".
- **A camera that ends on its own is reported.** Unplugging the device or withdrawing permission ends the track without `stop()`. The app kept showing a tracking status over a dead picture. It now releases the stream, returns to the start screen and says the camera was interrupted. Tests: `camera.test.js`; `application.spec.js`.

- **A pose must agree with the tracked hands.** With only hands in view, the pose model reports a small figure inside a hand with confident scores (0.73 to 1.0), so the scores cannot refuse it. Its proportions can: its forearms and upper arms measured 0.22 to 0.35 of the tracked hand's length, against 1.9 and more for a person. `poseContradictsHands` in `src/basis.js` refuses a pose whose longest visible arm segment is under half the longest tracked hand. This needs the hand tracker, so it does not act in lite mode with body layers on, or in regions that leave the hand layer off; other close-ups have no such cross-check. Tests: `pose-plausibility.test.js`; `positive-inference.spec.js`, "a close-up of hands". The imagined figure is not a constant of the model: on an Apple Silicon machine it was refused in 93 to 100% of looks over 30 s, and one CI run (x64, software rendering) refused it too, while another CI run at about one result a second saw none in 60 s and so drew nothing wrong either. The end-to-end test therefore watches 60 pose results for an arm being drawn and reports the refusals as an attachment instead of demanding one; on the source before the fix it failed in four of four local runs, between the 4th and 22nd look.
- **Focus zoom holds still.** `steadyZoom` in `src/focus-zoom.js` keeps the enlargement shown unless the region moves by 5% of the stage or changes size by 10%; the scene eases to a new value and keeps the old one for 1.2 s when the region is not tracked. A frozen picture and the still demo show the value at once. Test: `positive-inference.spec.js`, "an enlarged region holds still".

Measured and left unchanged: `video.currentTime` of a live stream advances at every display refresh, so it does not identify a new camera frame. With a camera delivering 8 frames a second, Chromium ran 29 face inferences a second at both high and balanced settings. `requestVideoFrameCallback` identifies real frames, but its behaviour on iOS Safari camera streams has not been tested here, and the automatic mode's 18-per-second threshold would then read a slow camera as a slow device. Both need a physical-device check before this loop is changed.

