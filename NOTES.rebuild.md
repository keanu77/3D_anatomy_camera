# Independent rebuild provenance and acceptance

Execution started 2026-11-13 on `rebuild/independent`, from plan commit
`1d0c3e8` and application baseline `9194a2a` (2.10.0).

## Boundaries

- Follow R0–R6 in order, with acceptance before the next milestone.
- Do not read the prototype or the old rendering/tracking implementations to
  author replacements. The prototype cache is only an overlap-check input
  after R0. The five parity tests execute the prototype for the last time in R0.
- Keep the three Chinese name tables and all head/hand-independent geometry
  byte-identical. No anatomy prose or Wikipedia text changes.
- The canonical MediaPipe face OBJ is the only permitted new third-party data.
- No production deployment, main-branch push, history rewriting, or public repo.

## R0 — baseline

- Overlap: **308 / 2,439** substantial lines (expected nonzero exit code 1).
  Module totals: scene 119, labels 64, CSS 48, hands 41, head 34, main 1, UI 1.
- Copied the prototype to the ignored cache for subsequent overlap checks.
- Six 640 × 480 static application screenshots are in
  `tools/out/reference/01-default-xray.png` through `06-full-body.png`.
  Exact settings: `tools/out/reference/settings.json`; repeatable capture:
  `tools/out/rebuild/capture.mjs`. No screenshots are committed.
- Immutable baseline: `tools/out/rebuild/immutable-baseline.json` records hashes
  for eight protected body files and three name tables, plus quantized vertex
  and index bytes of four torso nerve and sixteen non-head/hand peripheral meshes.
- Verification log: `tools/out/rebuild/r0-check.log`.
  The first sandboxed run passed lint, 258 unit tests and build, then could not
  bind port 4173 (`listen EPERM`). The rerun passed lint, **258/258 unit tests**,
  build, and **70/70 browser tests (4.5 min)**. Build: 46 files, 47,715,373 bytes.
- The existing dedicated rebuild branch is the isolation boundary specified by
  the user; no additional worktree or unrelated cleanup commit is introduced.

## Sequencing decisions

Section 1 says the prototype may only remain in the ignored cache after R0,
whereas R5 repeats its deletion. At the R0→R1 transition, remove the tracked
prototype and mark its five parity cases `fixme` (per R1). R5 will remove the
obsolete test itself. Do not point the parity tests at the cache after R0.

R1 retains the legacy head metadata schema while replacing its head geometry;
R2 will introduce the geometry-derived hand reference and its explicit frame
specification. Any temporary compatibility field must be derived from the new
reference, never copied from the prototype.

## R1 — independent head

### Sources and frame

The only new source is the official MediaPipe canonical face OBJ, pinned to
commit `c85dfbc2506b65ebc9a76340dc1234513b18c215`, SHA-256
`8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618`.
See `LICENSES/MediaPipe-canonical-face-model.md`. BodyParts3D remains the pinned
3.0 atlas already used by the body builders. The skin surface is FMA7163;
the separate `face` concept does not resolve to a usable surface in this atlas.

`head_frame.py` is the sole transform authority. Atlas coordinates are already
centimetres, +X subject left, +Y superior, +Z anterior. The proper similarity is
`canonicalCm = atlasCm @ HEAD_ROTATION * HEAD_SCALE + HEAD_TRANSLATION`.
Scale is 1.1412436275406224; the full coefficients are frozen in the module.
The left/right portions of the source eyeball mesh are separately tested to
remain on their respective sides after transformation.

Registration starts from seven rough points selected from the atlas's frontal
and sagittal skin profiles: four eye corners, nose tip, chin and forehead.
The rough atlas points and canonical indices are recorded in
`reproduce_registration()`. They are snapped to actual skin vertices. The ICP
direction is all 468 canonical vertices to atlas skin above Y=140 cm, with
80 fixed iterations, retaining 458 nearest correspondences (98%). The inverse
is the head transform. No prototype meshes, landmarks or previous transform
coefficients enter this calculation. `--reproduce` explicitly recomputes and
compares the coefficients; ordinary builders only verify the frozen transform.

Acceptance uses **untrimmed** measurements, separately from trimmed fitting:

- All 468 canonical vertices to transformed skin vertices: RMS **0.227036 cm**,
  P95 **0.405064 cm**; maximum **0.751114 cm**.
- Frontal surface: a fixed 0.25 cm XY grid over the canonical face, restricted
  geometrically to canonical triangles facing within 60 degrees of the front
  axis. Rays select the anterior-most atlas skin triangle, excluding hidden
  rear skin. Distances are exact point-to-canonical-triangle distances.
  **2,985 / 2,985 rays covered**, RMS **0.330836 cm**, P95 **0.541851 cm**,
  maximum **1.715052 cm**. No residual-based exclusions. Gates remain
  RMS < 0.35 cm and P95 < 0.7 cm, with zero missing coverage additionally required.
- The full silhouette includes side/neck-boundary mismatch. It is not claimed
  to have the same bound as the defined frontal region, nor clinical accuracy.

Attempts (all 80 iterations except landmark initialization):

| Method | Frontal RMS cm | Frontal P95 cm | Missing rays |
| --- | ---: | ---: | ---: |
| Landmark initialization only | 0.436951 | 0.586707 | 0 |
| Atlas-to-canonical, retain 80% | 0.907755 | 2.144324 | 78 |
| Canonical-to-atlas, retain 80% | 0.361259 | 0.512987 | 0 |
| Canonical-to-atlas, retain 90% | 0.355281 | 0.522103 | 0 |
| Canonical-to-atlas, retain 95% | 0.362866 | 0.579782 | 0 |
| Canonical-to-atlas, retain 100% (diagnostic, not trimmed) | 0.326682 | 0.548656 | 0 |
| Canonical-to-atlas, retain 98% (chosen) | 0.330836 | 0.541851 | 0 |

Raw attempt receipts and diagnostic images are in `tools/out/rebuild/`.

### Geometry and metadata

Seven head meshes come from the sources specified by the plan, with budgets
2,500 eyes / 70,000 cerebrum / 16,000 hindbrain / 36,000 muscles /
50,000 cranium / 12,000 jaw / 14,000 skin triangles. Muscles, skull and jaw use
the same per-source simplification allocation as the detail builder, preserving
source triangle identity and avoiding independently fitted structures.

The skin is clipped at atlas Y=141 cm using exact triangle/plane intersections,
without an artificial cap. The first attempt used trimesh's plane slicer, but
its installed version requires optional scipy; a small tested clipping helper
avoids adding that dependency. Plane intersection area and winding are tested.

The new `fit` uses 14 canonical vertices: 4, 6, 9, 21, 251, 54, 284, 172, 397,
78, 308, 132, 361, 199. They distribute constraints over the nose/central face,
upper lateral face, paired cheeks, mouth and lower face instead of concentrating
on one eye. Coordinates come directly from the pinned canonical mesh.

The jaw pivot is the midpoint of left/right condylar cap centroids. On each
mandible half (|X| > 3 cm), take the superior 35%, then the posterior 35% of
that region, then its superior 20% cap. These selectors separate the posterior
condylar region from the anterior coronoid region; no old pivot is consulted.
Label anchors are actual surface vertices nearest each named source's half-side
centroid, transformed by the shared frame. Existing English label keys and all
Chinese name tables are preserved.

R1 is explicitly a staged head-only migration: already-present hand sections
and `demoHand` are carried through unchanged, never used to derive new head
geometry. R2 must remove this temporary compatibility path and rebuild them
from bone geometry before any clean export is permitted.

`individual-body.json` is required to remain byte-identical, although its
historical `companionAssets` includes old head/neural hashes. The corresponding
test now checks the unchanged body/muscle/joint dependencies; the new immutable
test pins the entire individual-body JSON and BIN, so this exception cannot
hide body changes. Head/neural bundles have their own current checksums.

### Validation receipts and failures

- Test-first receipts: `r1-math-red.log`, `r1-rays-red.log`,
  `r1-registration-red.log`, `r1-clip-red.log`, `r1-head-red.log`.
- An overlapping individual-head/nerves build triggered
  `Original asset changed: nerves.bin`. An overlapping head verification and
  peripheral build similarly triggered `Unrelated geometry changed: peripheral.bin`.
  These guards were retained. Final acceptance runs all source verifiers
  sequentially, after mutations finish.
- Final sequential verification: `head_frame.py --reproduce` matched the frozen
  coefficients; 9/9 Python tests passed; head, individual-head, nerves and
  peripheral `--verify` all reproduced byte-identical output. Structure-info
  verification reproduced the pinned Wikipedia revisions unchanged.
- `npm run check`: lint, **260/260 unit tests**, build and **65 browser tests
  passed; 5 original-parity cases fixme/skipped (4.4 min)**, as R1 permits.
  All three Chinese tables, eight protected body files, and twenty non-head/hand
  nerve meshes passed the immutable checks. Log: `tools/out/rebuild/r1-check.log`.
- Runtime `src/` is unchanged; overlap remains **308 / 2,439** substantial lines.
- Preflight: no dependency/environment changes; JavaScript syntax check used
  (no TypeScript project); branch remains `rebuild/independent`; diff check clean.

## R2 — independent hand

`tools/hand_frame.py` derives the 21 right-hand landmarks solely from the pinned
BodyParts3D bones. Coordinates remain raw atlas millimetres. The former hand
data carry-through path has been removed from `build_head.py`; it now rebuilds
every mesh, label, pivot and reference point without reading an existing head
output. Metadata uses `handReference`, with no `demoHand` compatibility field.
The only change to the existing scene is this metadata-field rename; tracking
is rewritten separately in R3.

For each finger joint, the opposing end caps are the terminal 2 mm slabs, capped
at 10% of projected bone length, along the line joining adjacent bone centroids.
The landmark is the midpoint of the two cap centroids. Tips are actual source
vertices furthest along the direction from the preceding bone to the distal
phalanx. No runtime correction or prototype reference is used.

| Index | Geometric construction |
| --- | --- |
| 0 | Midpoint of opposing radiocarpal surface centroids, described below |
| 1 | Trapezium / first metacarpal end-cap midpoint |
| 2 | First metacarpal / thumb proximal phalanx midpoint |
| 3 | Thumb proximal / distal phalanx midpoint |
| 4 | Thumb distal phalanx furthest vertex |
| 5 | Second metacarpal / index proximal phalanx midpoint |
| 6 | Index proximal / middle phalanx midpoint |
| 7 | Index middle / distal phalanx midpoint |
| 8 | Index distal phalanx furthest vertex |
| 9 | Third metacarpal / middle-finger proximal phalanx midpoint |
| 10 | Middle-finger proximal / middle phalanx midpoint |
| 11 | Middle-finger middle / distal phalanx midpoint |
| 12 | Middle-finger distal phalanx furthest vertex |
| 13 | Fourth metacarpal / ring proximal phalanx midpoint |
| 14 | Ring proximal / middle phalanx midpoint |
| 15 | Ring middle / distal phalanx midpoint |
| 16 | Ring distal phalanx furthest vertex |
| 17 | Fifth metacarpal / little-finger proximal phalanx midpoint |
| 18 | Little-finger proximal / middle phalanx midpoint |
| 19 | Little-finger middle / distal phalanx midpoint |
| 20 | Little-finger distal phalanx furthest vertex |

The first wrist attempt used the distal radius extreme, which was biased toward
the styloid. It failed the source-distance test (15.971 mm to the lunate).
The final method identifies each radius/scaphoid and radius/lunate opposing
surface patch by a fixed band of minimum inter-surface vertex distance + 0.5 mm.
The radial and carpal centroids each weight the two facets equally; landmark 0
is the midpoint of those centroids. The carpal side is a composite joint surface:
the distance test checks radius versus the union of scaphoid and lunate, not
simultaneous contact with every constituent carpal cortex. The end-plane check
measures perpendicular distance to the end cap, not lateral distance to its
centroid; oblique joint surfaces do not share one centroid.

Across all 21 landmarks, maximum distance to the corresponding actual source
bone/joint surface is **1.716633 mm**; maximum perpendicular end-plane distance
is **2.030568 mm**. Both are below the unchanged 3 mm gate. Full per-point
receipt: `tools/out/rebuild/r2-landmark-distances.json`. These reference-bone
checks are not evidence of live skin-landmark alignment.

### Shared frame specification, version 1

All bases below are columns, with `world = origin + basis @ local`.

- Palm origin: landmark 0. Column 1: landmark 5 minus 0. Column 2: landmark 17
  minus 0. Column 3: unit cross(column 1, column 2), with magnitude equal to
  the geometric mean of the first two column lengths. This affine basis maps
  wrist/index MCP/little MCP exactly to (0,0,0)/(1,0,0)/(0,1,0).
- Finger origin: proximal landmark `a`. Its unit X axis points from `a` to `b`.
  Unit Y is the index-to-little knuckle vector projected perpendicular to X.
  Unit Z is cross(X,Y). Scale all three columns by the length from `a` to `b`.
  Proximal/distal endpoints are exactly local X=0/X=1; there is no tip shortening
  in the new mathematical frame.
- For a tracked left hand, compute the basis from its landmarks, then negate
  the depth column to reflect the right-source geometry. This is explicitly
  mirrored right-hand geometry, not a separately authored left specimen.
- `src/hand-frame.js` and Python use this same specification. Tests compare
  the palm and all 15 finger bases against the build metadata, test both unit
  endpoints, reject degenerate axes and verify left reflection mathematically.

New hand geometry: 12 source bones in the palm, plus the first metacarpal and
14 phalanges in 15 separately tracked meshes. Source identity ranges remain
independent of registration. The hand-dependent detail and peripheral bundles
use the same reference and basis. Head-only nerve geometry is unchanged; its
metadata is rebuilt to record the new head bundle checksum.

Acceptance: **13/13 Python**, **263/263 unit**, **65 browser tests passed and
5 planned original-parity cases skipped (4.4 min)**; lint/build passed.
Head, individual-head, nerves and peripheral verifiers reproduced identical
bytes, run sequentially. Existing hand nerve proximity and palm/finger
continuity assertions passed unchanged. Protected files/geometry remain
byte-identical. Logs: `tools/out/rebuild/r2-*.log`. Overlap: **307 / 2,467**;
the one-line scene metadata rename accounts for the reduction, not a renderer
rewrite. No dependency or environment changes; diff check clean.

## R3 — tracking rewrite

The head and hand implementations are authored from blank files using the
behavior contract. Interface inspection was limited to exported signatures,
consumer property names and call arguments. No old implementation or prototype
HTML is used as a rewriting template. A separate head subtask owns only the
new head tracker and its mathematical tests; the main task owns the hand tracker
and integration checks.

The hand updater applies the R2 affine palm and orthonormal finger frames directly
in stage pixels: X=landmark.x × width, Y=(1−landmark.y) × height,
Z=−landmark.z × width. Every finger uses the full tracked segment length.
Invalid, missing or degenerate tracking hides the entire hand atomically;
reacquisition snaps to the measured pose. The dark hand veil uses the measured
palm outline and finger chains with setting-controlled feathering and opacity.

Test-first receipts: `tools/out/rebuild/r3-hands-red.log` and
`r3-hands-green.log`. Six hand/frame unit tests pass. At 640 × 480, both right
and reflected left hands have **30 endpoint projections each**, with maximum
error **5.69e-14 px**, below the required 2 px gate. Receipt:
`tools/out/rebuild/r3-hand-endpoints.json`. `src/hands.js` overlap is **0**.

The head tracker uses the canonical pose directly, with a weighted NDC
least-squares scale/translation fit. The screen transform left-multiplies the
base camera projection; its inverse is updated for picking. Group position,
quaternion and scale remain ordinary transforms. User calibration is applied
after automatic fitting so the fit cannot cancel manual controls. Time smoothing
uses a 75 ms exponential time constant; acquisition/reacquisition is immediate.
JawOpen is bounded to [0,1] and maps to [0,0.35] radians about the existing pivot.

Seventeen new head tests passed after recorded red runs. A synthetic 640 × 480
case with all 14 fit points and a known screen correction has mean error
**16.024432 px before / 2.73e-14 px after**, below the required 3 px.
Evidence: `tools/out/rebuild/r3-head-agent.txt`. This is mathematical registration
evidence, not physical-device or patient-specific validation.

Head source overlap is **0**, and hand source overlap is **0**. Overall overlap
is now **232** lines, reserved for R4. The first full build caught a missing
`HAND_BONES` export; it is now a compatibility alias of the independently defined
`HAND_SEGMENTS` list. No duplicated rig definition was introduced.

R3 acceptance: `npm run check` passed lint, **283 unit tests**, build and
**65 browser tests** (five prototype comparisons remain deliberately skipped
until R5). All actual-model face, hands, pose, body-muscle and head-nerve
positive-inference cases passed, along with application and worker cases.
Log: `tools/out/rebuild/r3-check.log`. No unresolved R3 gate.

## R4 — rendering and interface rewrite

`scene.js`, `labels.js`, `style.css` and the HTML structure were authored anew
from the behavior contract. Rendering is divided into a transparent WebGL
body pass, perspective head pass, and orthographic hand pass. Inspection pass
priorities use the same order. Existing body, focus, source picking, pause,
orbit and zoom modules retain their behavior. Materials keep the documented
uniform interface, including the same half-space used by raycasting.

The independently designed demo uses a gentle open-arm full-body stance and
atlas-proportioned hands; head-only mode raises both hands beside the skull.
The neutral hand dimensions come solely from the R2 reference landmarks.
No camera is opened. Static poses are deterministic across display reflection.
The source metadata's existing body demo fixture remains byte-identical.

`render-style.js` centralizes anatomical colors, additive gains, base light,
rim curve, solid lighting, masks and selection highlight. Bone is cool blue,
muscle coral, and nerve amber. A nonzero tube base keeps nerves continuous;
moderate gains preserve the overlapping skeleton. Solid materials write and
test depth. Dark masks, plane softening and the display-space lens remain
independent of source anatomy coordinates. The HTML/CSS interface uses a
high-contrast observation workspace with native CJK fonts and accessible
mobile controls; no third-party assets or dependencies were added.

Tests preceded the new projection/decode/demo math: `r4-render-red.log` then
`r4-render-green.log` under `tools/out/rebuild/`. Eleven projection/layout tests
passed; the complete unit suite now has **289** passing cases. Existing
source-asset tests required the public `decodeGeometry` export to remain
available. Two mocked materials needed the already-documented `uBase` uniform
added when base light was applied to all layers; no assertions were weakened.

The first integration run passed 23/24 cases. The remaining case completed its
behavior assertions but failed closing a trace because two Playwright runs
shared their output directory (`ENOENT ... recording14.trace`). The UI run
has been isolated from the main test output; the subsequent complete run has
passed that same skull/carpal/finger/mobile case. The UI's seven focused
accessibility/responsive tests also passed. Full acceptance is still pending.

Review artifacts are `tools/out/review/look.png` (the exact six R0 settings,
old/new side by side) and `tools/out/review/readability.png` (all systems,
solid occlusion, continuous nerves, plane, lens, feather and brightness).
Near-white pixels in the default full-body image fell from **626/307200**
to **7/307200**; all systems together have **58/307200**. These measurements
support, but do not replace, visual inspection. Current contrast ratios are
15.66:1 for primary controls, 8.29:1 secondary text, 9.39:1 selected controls,
and 16.47:1 canvas labels. Metrics and individual screenshots are adjacent.

Provenance disclosure: an interface subtask's selector-only search accidentally
returned three scene style-hook lines because shell-expanded paths bypassed
its glob exclusions. It did not open the scene file or use those snippets as
an implementation template. No old CSS or prototype HTML was read. Four
coincidental standard lines remained after the independent rewrite (clock,
DOM lookup, clear color, hidden selector); behavior-equivalent independent
forms now give an overall overlap result of **0 / 2628 substantial lines**.

A subsequent full check was deliberately interrupted at the production inference
case after **43 passed**: the diagnostic text had changed from `frames/s` to
`fps`, while the unchanged acceptance test requires `frames/s`. The original
public diagnostic wording is restored. Independent review also caught jaw-label
clipping before its pivot transform; a failing numerical test now verifies the
head-space plane after that transform (12 projection/layout tests pass).
The final complete check is rerun after these corrections.

Final R4 acceptance: lint, **290 unit tests**, build and **65 browser tests**
passed; five prototype comparisons remain intentionally skipped for R5 removal.
Every actual-model case passed, including head nerves without a required body
pose. Log: `tools/out/rebuild/r4-check-final.log`. Whole-source overlap is
**0 / 2635**. Immutable data and names have no R4 diff. No unresolved R4 gate.

## R5 — cleanup and self snapshots

Removed the extractor, prototype parity spec, superseded implementation plan,
and already-absent tracked prototype directory. The active rebuild plan itself
contains the two path strings its cleanup gate forbids. To satisfy that gate
without rewriting the user's instructions, its exact text is preserved in the
ignored cache as `PLAN.independent-rebuild.md`; it is removed from the exportable
tree. This is reversible and also satisfies R6's explicit plan-file exclusion.

The six reviewed R4 renders are now `tests/e2e/snapshots/*.png`, exercised by
`visual.spec.js`. All six passed locally with unchanged pixelmatch settings:
threshold 0.1, includeAA false, changed ratio below 0.01. CI shard selection
includes the replacement spec. Historical registration descriptions in the
head-detail and optic notes now point to the independent coordinate system,
and their displayed numerical metrics come from current generated metadata.
No anatomical description, vocabulary file or Wikipedia text was rewritten.

The documentation audit exposed one missing retained behavior: turning a frozen
view should dim the whole video plane rather than leave only its old silhouette.
An added browser assertion first failed with corner alpha 0; the renderer now
uses the configured dark veil over the whole frame while frozen and rotated,
then restores its normal silhouette when levelled. The existing pause/orbit
assertions are preserved; full R5 validation covers this correction.

Cleanup scan: **156 authored text files, zero matches** for both forbidden path
markers. Generated `dist` and `public/licenses` also have zero matches. The
packaged head binary matches the independent source byte-for-byte (SHA-256
`95ebe2777cc19e3b43e1332b797f78bf85bd0b79993d79d833771c615b9e2111`). The source
scan uses Git's exportable file inventory, excluding repository internals,
installed dependencies, virtual environments, ignored caches and test reports.

Final R5 acceptance: lint, **290 unit tests**, build and **71 browser tests**
passed with **zero skips**. The restored frozen-view assertion and all six
self-snapshots passed. Overlap: **0 / 2639**. Cleanup scans and build contents
passed as above. Log: `tools/out/rebuild/r5-check.log`. No unresolved R5 gate.

## R6 — independent distribution

Version 3.0.0 separates project-authored MIT code (2026 吳易澄) from the
existing data and text licenses. The English entry page includes a 32-frame
camera-free demo GIF rendered by this implementation; the Traditional Chinese
guide remains available as `README.zh-TW.md`. Rendered data retain their source
license requirements. No anatomical description or approved terminology changed.

A clean checkout has no cached tracking models. Asset preparation now invokes
the existing pinned, checksum-verifying model fetcher before copying WASM;
this makes the prescribed clean `npm ci && npm run check` self-contained.

The release candidate was exported with `git archive` from staged branch tree
`7b20782a308a9d7facad6bef6cf091bfeeaad75c`, allowing all R6 acceptance gates to
finish before its milestone commit. The export at `../anatomy-mirror-export/`
contains no prior Git history or rebuild plan. Its exact `npm ci && npm run
check` passed lint, **290 unit tests**, build and **71 browser tests** with zero
skips (4.4 minutes). The three tracking models were downloaded into this clean
tree and verified by their pinned checksums. Log:
`tools/out/rebuild/r6-export-check.log`. The 159 exportable authored text files
have zero forbidden path matches; whole-source overlap remains **0 / 2639**.

The new repository is `https://github.com/keanu77/anatomy-mirror`, confirmed
**private** through GitHub. Its initial, history-free commit is
`6e99cecb3f2e53427e2df1e5064413ffd4ed8d5f`, with the exact archived tree above;
the initial remote main SHA matched. Subsequent CI follow-up commits described
below retain that history-free root and do not import the earlier repository.

Initial preview deployment `9b73a05b` uses **rebuild-preview** only:
`https://rebuild-preview.anatomy-mirror-cj3.pages.dev/`. Its version endpoint
returns **3.0.0** and the new initial commit. All **46 assets / 47,608,039 bytes**
match the local build by SHA-256; security and delivery headers pass. Desktop
(1280 px) and mobile (390 px) browser emulation render and pause successfully,
with zero horizontal overflow or browser errors. Images are in
`tools/out/review/preview-desktop.png` and `preview-mobile.png`. The first
ad-hoc preview check was stopped because it waited on development-only globals,
which are deliberately absent from production; the completed check instead
uses the visible controls and canvas. This is not physical-device camera QA.

After deployment, production's version response is unchanged at **2.10.0**,
commit `9194a2ab724ca731ed314247821d6eef460e0918`. The existing repository's
remote main remains at that same SHA. No production deployment, DNS change,
public-repository switch, force push or verification bypass was performed.

The first CI run (`43281703125`) passed shard 1, but identified two test-harness
portability issues. Shard 3 reported `solid labels are visibly drawn: expected
> 100, received 0` (27 other tests passed). Settings changes asynchronously
reconcile bundles before drawing; checking a checkbox is not a render-completion
barrier. The test now waits for the actual label layout to clear and then become
nonempty before each screenshot, while retaining the > 100 pixel assertion.
The failure screenshot itself showed the solid labels present.

Shard 2 passed 23 tests and failed only the text-bearing brain snapshot:
`expected < 0.01, received 0.022106119791666667`. System font metrics differ
between macOS and Linux. A reviewed Linux-only reference was extracted exactly
from the CI stage rectangle (0,252,640,480); comparison reproduces the reported
**6,791 pixels** exactly. Brain-core and right-hand-core comparison regions each
have zero differing pixels. The macOS reference remains; all five geometry-only
cases still share their original reference. Threshold 0.1, includeAA false and
the 1% limit remain unchanged. No fonts or third-party data were added. The
first follow-up changes only two test files and this additional rendered reference.
All seven focused local cases passed after these changes. Remote CI is rerun
before final acceptance; no successful-CI claim is made from the first run.

The render-completion hypothesis alone did not resolve the solid-label case:
run `43282877739` passed 70 browser cases and failed the same > 100 assertion
with 0. Diagnostic commit `1a6e215` then retained both composite screenshots
and both raw HUD images. In run `43283995962`, the solid-mode HUD before and
after enabling labels had identical SHA-1 `50c4d575822138bde8468a2b1630672ab7f0aa92`
and **75,625 nontransparent pixels**, despite the layout having reached zero.
The composite screenshots were also byte-identical. The X-ray HUD cleared to
zero, and the local solid HUD cleared to zero, localizing the retained surface
to the Linux solid-mode path rather than missing label geometry or font metrics.

The renderer now explicitly hides the HUD element when labels are disabled and
shows it when enabled, in addition to clearing/redrawing its contents. This
makes the disabled layer's visibility unambiguous even if a canvas surface is
retained. A local regression first failed with `expected hidden, received visible`;
after the two-line renderer change, all six visual references pass. The behavior
case was interrupted by `Execution context was destroyed` during Vite reload,
before reaching its assertions; the plan-directed rerun passed (1/1), including
both visibility assertions and the unchanged > 100 pixel assertion. Whole-source
overlap remains **0 / 2641**. Paired image receipts
remain attached to the browser test. No upstream Chromium defect is claimed from
this evidence. Full export and CI acceptance are rerun after the runtime change.
