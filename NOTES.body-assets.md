# Body asset pipeline

## Source choice

The body uses the official **BodyParts3D 3.0 conventional OBJ release** (`20110915/BodyParts3D_3.0_obj_99.zip`), rather than combining mismatched releases. Its source provides complete lung lobes and the requested skeletal and organ surfaces in one coordinate system.

The official 4.0 IS-A and PART-OF archives were inspected first. Their lung compound entries resolve to bronchovascular internals, without enclosing lung surfaces. The 4.0 release notes also document shifted skeletal coordinates. Combining those skeletons with 3.0 lung surfaces without validated registration would introduce avoidable alignment uncertainty. The inspected 4.0 downloads are unused cache files and are excluded from delivery.

No generated primitive, AI anatomy, or approximate substitute surface is used. Every delivered triangle descends from the selected official OBJ geometry. Source references and SHA-256 values are pinned in `tools/build_body.py` and `public/anatomy/body.json`; mismatched cached or downloaded files cause the build to fail.

## Build and verify

```sh
python3 -m venv tools/.venv
tools/.venv/bin/python -m pip install -r tools/requirements-body.txt
tools/.venv/bin/python tools/build_body.py
tools/.venv/bin/python tools/build_body.py --verify --no-previews
```

The first build downloads a 128 MB source archive into `tools/cache/`. Existing binary/JSON files are delivered with the app; end users do not run this pipeline. The pinned build environment used Python 3.13.15 on macOS ARM64. `--verify` rebuilds both outputs in memory and requires byte-for-byte equality. It detects platform/library drift rather than assuming it cannot happen.

## Verified output

- 18 meshes, 135,456 triangles; maximum per-mesh vertices: 27,547.
- `body.bin`: 1,224,018 bytes.
- SHA-256: `8f8a0b6877e2a5ec8a2109212fae24d7e7c03fdf1b73a97573a7de30db18f950`.
- All indices are within their mesh; all offsets are even; each mesh meets its triangle budget. Torso and separate cervical spine together meet the 60k budget; all organs together meet the 50k budget.
- Independent sequential rebuild produced byte-identical binary and JSON.
- Front, side, organs and per-mesh source-space previews are generated under `tools/out/preview_*.png`. Source anatomical left is +X; the conventional front view consequently places anatomical left on the viewer's right. Runtime mirror mode can intentionally reverse the display.

## Coordinate and reference contract

The source is in millimeters with +X anatomical left, +Z superior and -Y anterior. It is transformed by `[x,z,-y]/10`, with positive determinant, into centimeters with +Y superior and +Z anterior. The measured cranial-vault to calcaneal-floor span is 164.04426 cm; left/right shoulder, hip and ankle ordering is asserted before producing assets.

Humeral/femoral proximal head centers use a least-squares sphere fit to their proximal medial articular surface region. Fitted radii were 2.18/2.16 cm for humeri and 2.44/2.37 cm for femora. Other joint references use specified source endcap regions. These are geometry-derived alignment approximations, not clinician-calibrated joint centers. Torso hip references are offset laterally by 2 cm as specified in the plan; bone frames retain the fitted femoral-head references. Both are recorded explicitly.

- Torso: origin midpoint of hip references, e1 left shoulder minus right shoulder, e2 shoulder midpoint minus hip midpoint, e3 cross direction scaled by the geometric mean of e1/e2 lengths.
- Bone: proximal-to-distal +X, length-normalized; +Y uses projected torso e3; +Z is the cross product. `jointAnchors` transform the anatomical references into `[0,0,0]` and `[1,0,0]`.
- Foot: origin heel, e1 toe minus heel, e2 ankle minus heel, e3 cross direction with geometric-mean scale. `landmarks` lists ankle, heel, toe in that order.
- Labels reference their own mesh's normalized frame; no unsupported `ribs` UI layer is emitted.
- Cervical C3-C7 is separate (`cervical_skel`, `cervical: true`) for independent visibility control.

The full-body demo is the source rest pose normalized into a 4:3 frame. It is a synthetic regression fixture; it does not validate camera inference, individual body proportions, joint-center accuracy or phone performance.

## Limits

The rigid torso basis cannot reproduce spinal flexion or independent scapular motion. The grouped forearm is not a radius/ulna pronation model. Pose and hand depth origins differ; their normalized coordinates must not be treated as a shared metric anatomical frame. Preserve the educational/reference-anatomy notice in the interface.
