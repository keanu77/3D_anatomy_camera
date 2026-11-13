# Implementation decisions and verification

## Adopted plan corrections

- Independent module, model, and QA work ran in parallel. Validation gates were completed before a consolidated initial release commit instead of publishing intermediate incomplete milestone snapshots.
- The original is immutable. Its SHA-256 is `b5e12cd0755ac0976e655c4f9ac914c2a7a6b54474455d66549cbdfa6511dfb0`; extracted head/hand binary is 2,032,482 bytes, SHA-256 `9ee6b0f7311afc24e5795fdaa54a4e8f80b09cd4890fbd0b5a0b5dfa7adffb54`.
- Test infrastructure was built alongside M0. The original's actual demo syntax is `?still#demo`. Baselines are captured directly, avoiding its single-frame dump timing bug. New app accepts both query/hash flags. Production has no dump/debug API.
- BodyParts3D 3.0 conventional surfaces provide complete lungs and consistent skeleton/organ coordinates. Using this source avoids mixing shifted 4.0 skeleton coordinates and older organ surfaces. The older source's explicit CC BY-SA 2.1 JP grant is retained. Details: `NOTES.body-assets.md`.
- The cervical spine is a separate mesh. Body labels explicitly name their mesh/frame and use the supported layer keys. The body data is lazy loaded.
- The original 25 MB total / 12 MB excluding WASM budget is impossible with the specified dependencies: fixed models alone are 17,355,447 bytes, the complete pinned WASM directory is 19,137,794 bytes, and original anatomy adds 2,032,482 bytes. Revised budgets are 50 MB total / 30 MB excluding WASM. First-page and incremental downloads are checked independently.
- HTTPS is configured using the Vite basic-ssl plugin; no obsolete `--https` flag. Build config uses the installed Vite 8 chunk function API.
- `frame-ancestors` is only in the response header, not the meta CSP. No additional script eval permission was added. CSP is tested against the actual production build and real model initialization/inference.
- Version 2.0 used synchronous, independently throttled inference. Version 2.2 moves it into a local worker where supported, with one frame in flight and a main-thread compatibility path. GPU creation still falls back to CPU. Details and device-validation limits are in `NOTES.tracking.md`.
- Pose masks are consumed inside the MediaPipe callback; only a drawn bitmap is cached briefly between pose inference frames. No MPMask survives its callback. Demo mode loads no inference models.
- Mobile layout preserves video aspect in both orientations. Coarse-pointer landscape remains in mobile mode; drawer focus is applied after visibility updates.
- Handedness is anatomical and independent of CSS mirroring. Direct inference on the official `right_hands.jpg` fixture returned Right + Right (scores 0.9512 / 0.9639); the original mirror-dependent swap was incorrect and has been removed for live tracking. The original synthetic demo remains pixel-identical.
- Adversarial review reproduced and fixed camera restart after Stop during a failed switch, an expired demo failure overwriting a newer live session, optional hand-tracker failure stopping all tracking, mobile errors hidden in the drawer, and switching mirror before the scene finished loading. Regression tests cover these failures.
- Official model downloads and build-time dependencies are external; the running website only fetches same-origin static resources and never uploads video/landmarks.
- Direct Upload publishes to a dedicated Cloudflare Pages project (`3d-anatomy-camera`). The repository was private through R6 and is public as `keanu77/3D_anatomy_camera` since the 3.0.0 release. CI checks pushes but does not automatically deploy.

## Verification record

- Local JavaScript syntax/prohibited-API scan passed. This is a vanilla JavaScript project; no TypeScript type-safety claim is made.
- 39/39 unit tests and 22/22 browser tests passed the integrated run. After the handedness correction, all 8 affected browser checks passed again (five original baselines, two mirror comparisons, and positive right-hand detection in front/rear display modes). An additional check waits for new video frames after switching, to rule out stale tracking data.
- Five immutable-original visual variants each had exactly 0 / 307,200 changed pixels. Head/hand and full-body front/rear reflection checks also had 0 changed pixels.
- Actual installed models detected 478 face landmarks, two hands, and 12 visible body parts in official image-derived video fixtures. These images remain in the OS temp directory, with no screenshots/traces or photos committed/deployed.
- All three tracking models initialized and ran under production CSP using same-origin requests. URL import override and production debug exposure checks passed.
- Body rebuild was byte-identical: 18 meshes, 135,456 triangles, 1,224,018 binary bytes. Original head/hand hash remains unchanged.
- Full-body 30-second sample in Chromium forced to software SwiftShader: 30,076.1 ms, 126 samples, mean 238.70 ms/frame (approximately 4.19 fps), P95 250.10 ms. This intentionally software-rendered automation result is a reference, not a mobile GPU measurement or performance acceptance claim.
- Runtime npm audit: zero reported vulnerabilities for the two production dependencies at verification time.
- Complete uncompressed website approximately 40.52 MB, including both SIMD and non-SIMD WASM variants. No inference/geometry binaries are fetched by the intro page.

## Explicit validation limits

- Chromium device emulation proves layout and tested browser logic, not physical iPhone Safari/Android camera support.
- Synthetic video proves real model initialization/inference and CSP compatibility, not correct human landmark localization.
- Source pose geometry and pixel endpoint tests prove transform consistency, not person-specific anatomical accuracy.
- No physical mobile camera session, heat/battery endurance test, or clinical validation has been performed in this environment.
- The torso is a rigid affine basis; it does not reproduce spinal articulation, scapular movement or radial/ulnar pronation. Joint references are geometry-derived approximations. Camera perspective differs by device; no unvalidated phone FOV preset was added.

## Physical-device acceptance checklist

- [ ] iPhone Safari: HTTPS camera grant, front/rear switch, portrait/landscape, background return, retry after denied permission.
- [ ] Android Chrome: same camera and lifecycle checks.
- [ ] Both: 10–15 minute use, sustained inference/display FPS, thermal behavior, overlay fit across distance/occlusion, no persistent camera after Stop.

## Version 2.1: three-system expansion (2026-11-12)

- Added independent muscle, connective-tissue and neural bundles: 24 muscle regions (276 source components, 161,000 triangles), 15 joint/connective-tissue regions (49 components, 70,500 triangles), and 9 neural meshes (35 components, 27,566 triangles). Original head/hand and body assets remain byte-identical. Each new pipeline passed deterministic rebuild checks.
- Muscle and connective-tissue surfaces use the same pinned BodyParts3D 3.0 frame. The neural bundle combines 30 actual HRA spinal-cord segments with five BodyParts3D optic structures; the incomplete BodyParts3D spinal-cord alias was not used as a substitute for the full cord. Sources, registration measurements and per-source licences are documented separately.
- Primary presets cover skeletal/joint, muscle, nervous/sensory and combined systems. All three new bundles load independently, cancel stale requests, retain loaded caches and report failures. Head optic structures follow face tracking even without Pose; the cord follows the torso.
- Fixed forearm roll by using the palm-plane normal with anatomical-side signs. Shared label placement prevents collisions and viewport clipping when several systems are enabled. Head-only rendering preserves the original layout.
- 62/62 unit tests passed. All 37 browser cases passed across the integrated run (36 passes) and one focused rerun after correcting a fixture assumption: the portrait also produces confident in-frame hips, so it cannot stand in for absent Pose. A separate renderer test explicitly supplies no Pose and verifies five visible head optic structures with zero visible cord regions.
- The first Linux CI run passed all 62 unit tests and 36 browser cases, but the sequential Pose-to-Face/Pose lifecycle case exhausted its 120-second total deadline. Its trace reached Pose readiness at about 23 seconds, Face/Pose checks at 64 seconds, and a fresh nerves-only Pose frame at 107 seconds. The final checkbox action completed before the deadline error; no earlier assertion failed. That case now budgets 210 seconds for its two existing 90-second model waits and lifecycle checks, without changing assertions. CI distributes the complete 37-case suite across two independent shards (24 + 13, no omissions or duplicates).
- Five original visual comparisons and three mirror comparisons each had exactly zero changed pixels. Browser cases cover independent downloads, cancellation/retry, combined styles/labels/reveal, mobile controls, camera lifecycle, real model inference and production CSP.
- Latest software SwiftShader 30-second full-body sample: 30,083.9 ms, 84 samples, mean 358.14 ms/frame, P95 383.30 ms. This includes the new layers and remains a software-rendering reference, not device performance acceptance.
- Built output is approximately 43.18 MB including 19.14 MB of WASM, within the 50 MB total / 30 MB excluding WASM budgets. Intro-page loading remains separate from model and anatomy downloads.
- Coverage is deliberately explicit: selected discs/cartilage/ligaments/tendons, not a complete joint atlas; brain/eyes/optic structures/cord, not all peripheral nerves or sensory organs. Muscle regions and cord use rigid tracking, not physiological contraction or spinal articulation. Cross-source registration is approximate and has not been clinically validated.

## Version 2.2: background tracking and mobile controls (2026-11-12)

- Moved supported-browser inference into a bundled classic Worker with one frame in flight, transferred image/mask ownership and generation guards. Unsupported initialization retains a prepared main-thread compatibility path. Interrupted bootstrap recovers after camera switches and visibility changes; transport failure stops detection until preparation succeeds. All-disabled layers still render without model initialization.
- Fixed the pinned MediaPipe Mac-worker mask conversion and normalized-byte GPU texture readback. Positive Pose/body-muscle tests require actual veil pixels. Source investigation, numeric evidence and ownership details are in `NOTES.tracking.md`.
- Mobile preset cycling now follows current selections. The settings drawer has modal semantics, background inertness, a complete focus trap and breakpoint focus recovery; styles expose their selected state.
- JavaScript syntax/source checks, production build, all 97 unit tests and all 44 browser cases passed in the final integrated run (3.4 minutes). This JavaScript project has no TypeScript configuration or typecheck script. Dependencies are unchanged; the current production-dependency audit reported zero vulnerabilities.
- Five original visual comparisons and three mirror comparisons each returned zero changed pixels. During actual background Pose inference in local Chromium/SwiftShader, Stop returned to the intro in 66.0 ms, released the camera and accepted no subsequent render from the canceled frame. This single automation sample is not a physical-device latency guarantee.
- Build: approximately 43.33 MB including 19,137,794 WASM bytes, within the existing size budgets. Anatomy and pinned inference assets are unchanged. CI now shards the expanded browser suite into three jobs; physical-device/Safari and endurance acceptance remain pending.

## Version 2.3: individual anatomy inspection (2026-11-12)

- Added optional source-separated geometry for precise muscle, muscle-head and bone selection. Each picked triangle resolves directly to its source ID; X-ray exposes overlapping candidates and Solid respects the foremost rendered surface. Highlighting follows the selected source range, with names, anatomical side and explicit hand-mirroring provenance.
- Detailed assets load only after enabling inspection and restore the original geometry when disabled. The body and head/hand additions total 3,530,785 bytes. Their deterministic rebuilds passed; all ten original anatomy assets remain unchanged. Source subdivisions are explicit, and the two dorsal-foot interossei source sets remain labeled groups. Coverage and registration limits are documented in `NOTES.individual-body.md` and `NOTES.individual-head.md`.
- Fixed orthographic picking for surfaces ahead of the camera plane, pending-pick cancellation after Clear/Escape, mixed-bundle download errors and retry, and toolbar/live-status overlap. Tests cover actual pointer and touch selection, adjacent bones and muscle heads, source sides, overlap, clipping/lens, visibility, Stop, stale requests and mobile controls.
- Final local syntax/lint and build checks passed, with 140/140 unit tests and 55/55 browser cases passing in the integrated run (3.8 minutes). Five original-image and three mirror comparisons each returned zero changed pixels. The nine-case direct-click smoke passed with no page/HTTP errors. Actual-background-Pose Stop sample: 34.67 ms; this remains an automation sample, not a physical-device guarantee.
- Unversioned build: 41 files, 46,885,866 bytes including 19,137,794 WASM bytes; 27,748,072 bytes excluding WASM, within the 50 MB / 30 MB budgets. Dependency versions are unchanged. Exact source selection does not establish person-specific camera alignment; physical-device and clinical-validation limits still apply.
