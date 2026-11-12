# Individual anatomy inspection

## Accepted scope and design

The user requested exact individual muscle/bone picking after approving click/touch, highlighted selection, names and clearing by clicking empty space. Inspection uses individually simplified source surfaces with complete contiguous triangle ownership. Regional point proximity is not used to infer a name.

The normal viewer uses overview geometry. Activating inspection lazily loads source-separated geometry and replaces matching regional mesh buffers in the same tracking frames. Turning inspection off restores the overview buffers. This preserves existing visual baselines while making inspected geometry and picked geometry identical. Mesh parts carry pinned source identifiers, exact English names, anatomical side, kind and index ranges; source-defined subdivisions and unresolved source aggregates remain explicit.

Picking follows the renderer's perspective head and orthographic body/hand passes, anatomical mirroring, visibility and shader cut planes. X-ray mode lists overlapping source parts; Solid mode selects the foremost rendered surface. A single highlighted part follows its tracked transform. Layer changes, Stop and lost tracking cannot retain an unrelated visible highlight. Names are DOM text; uncertain translations retain the source English.

## Implementation plan

- [x] Build `individual-body` geometry and metadata from pinned body/muscle OBJ identities; verify deterministic output, source coverage, side and non-overlapping ranges without changing existing assets.
- [x] Build `individual-head` skull, muscle and palm geometry; verify source-to-existing-frame registration and exact finger metadata. Preserve source-versus-displayed hand side.
- [x] Add `anatomy-names.js`, `inspection-ui.js` and scoped styles for activation, loading/retry, keyboard-accessible names and overlapping-part selection.
- [x] Add `picking.js` and `inspection.js`; validate ranges, raycast actual detailed geometry, respect visibility/clip/lens/pass order, swap/restore buffers and dispose highlights safely.
- [x] Integrate scene/body/hand target descriptors; add meaningful unit and browser tests for separate adjacent bones/muscles, side/mirroring, overlap, clipping, hidden layers, stop, retry and lazy loading.
- [x] Run full regression/build/size checks, retain project-owned visual snapshot coverage and update coverage documentation. Release commit, CI and deployment receipts are recorded in the local handoff after publication.

## Validation boundaries

Exact source identity does not make camera registration patient-specific. Source anatomy still follows the existing rigid tracking frames. Physical devices and clinical accuracy require separate evaluation. Do not count source subdivisions as distinct whole muscles or silently give individual-muscle names to aggregate source surfaces.

The detailed source inventory contains 325 muscle components, 171 bone components, 28 teeth, two gingiva and one aponeurosis (527 source identities including unchanged finger geometry). Muscle/bone components include heads, subdivisions and three parts of the sternum; these are not counts of whole muscles or whole bones. Left-hand display adds paired anatomical labels while retaining the original right-hand geometry provenance. The two dorsal-foot interossei source sets remain explicit aggregates because neither pinned v3 nor the inspected v4 inventories provides individual named surfaces; connected fragments cannot justify invented ordinal labels.

## Implementation evidence

- Both new source pipelines reproduced byte-identical outputs. Body bundle: 2,517,749 bytes; head/hand bundle: 1,013,036 bytes. The original ten anatomy files remain unchanged.
- Nine source-picking browser groups pass, including adjacent radius/ulna and femur/patella, biceps/triceps/pectoralis/deltoid parts, skull/carpal/finger, real mobile touch events, Solid occlusion, X-ray overlap, mirrored sides, clip/lens misses, cancel and mixed download failure/retry.
- Orthographic rays start at the actual near plane. The body/hand camera's negative near value makes anterior surfaces visible even ahead of its origin; Three's default camera-plane ray missed patella and clavicular pectoralis surfaces. A failing regression reproduced this, then passed alongside actual source-triangle browser clicks after the correction.
- A separate pick revision invalidates pending pointer results when Clear/Escape or a newer selection occurs. Independent delayed-download reproduction now leaves selection null and highlight indices zero after cancellation.
- The existing fixed-stage image fixture hides interface controls (including the new sibling toolbar) to compare anatomy pixels. Separate tests exercise the real visible toolbar and mobile layout.
- Final integrated validation: lint/build passed, 140 unit tests passed, and all 55 browser cases passed in 3.8 minutes. Five original-image comparisons and three mirror comparisons each returned zero changed pixels. Nine additional local source clicks were inspected through the actual interface, with no page/HTTP errors.
