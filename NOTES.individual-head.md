# Individually identified head and hand surfaces

`tools/build_individual_head.py` produces the additive `public/anatomy/individual-head.json` and `.bin`. It never writes the existing head, body, muscle, joint or neural bundles. Inspection can replace the four corresponding overview geometries; ordinary rendering continues using the independently rebuilt overview meshes.

Every replacement triangle belongs to exactly one actual BodyParts3D OBJ element. The builder simplifies one element at a time, welds duplicate coordinates only within that element, then concatenates the results without welding between identities. `parts[].start/count` are contiguous index ranges, in multiples of three; `vertexStart/vertexCount` prove that no triangle references another source element's vertices. Picking a triangle can therefore recover its source identity directly. Registration measurements never determine or guess identities.

## Delivered scope

| Overview parent | Source components | Triangles | Vertices |
| --- | ---: | ---: | ---: |
| `muscles` | 49 named muscle components + 1 epicranial aponeurosis | 35,964 | 18,274 |
| `cranium` | 21 skull bones + 14 upper teeth + 2 gingiva | 49,040 | 24,563 |
| `jaw` | Mandible + 14 lower teeth | 11,988 | 6,024 |
| `hand_palm` | 8 carpals + 4 finger metacarpals | 4,974 | 2,511 |
| Total new geometry | **114 source components** | **101,966** | **51,372** |

The 22 skull bones include paired parietal, temporal, zygomatic, maxillary, nasal, lacrimal, palatine and inferior nasal concha bones, plus frontal, occipital, sphenoid, ethmoid, vomer and mandible. The 49 muscle components preserve the actual subdivisions, including orbital/palpebral orbicularis oculi, superficial/deep masseter and upper/lower lateral pterygoid heads. Exact names and FMA IDs are in the JSON; no whole-muscle label replaces a source subdivision.

The overview muscle geometry includes the temporoparietalis muscles and epicranial aponeurosis. These source components are retained. The aponeurosis is explicitly `kind: "aponeurosis"`, not muscle. The overview cranium also includes both upper and lower gingiva: these are retained as `kind: "gingiva"`, not bone. The lower gingiva retains its static cranium parent; independent jaw articulation of this tissue remains a representation limitation. Teeth use `kind: "tooth"`.

The 15 unchanged finger meshes have identity metadata in `existingParts: [{parent, parts}]`. `hand_b_1_2` is the **first metacarpal**, not a proximal phalanx; it is excluded from the palm replacement to prevent duplication. The other 14 meshes are the thumb's two phalanges and the other fingers' three phalanges each. Together with the 12 palm elements this identifies all 27 represented hand bones.

The source has 28 permanent tooth surfaces. Third molars, deciduous teeth, ear ossicles, hyoid, intrinsic hand muscles and platysma are not added. The bundle does not claim a complete anatomical atlas or facial muscle deformation.

## Source and size

All elements use the same pinned [BodyParts3D 3.0 conventional archive](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_99.zip), its English inventory and composite hierarchy, as `tools/build_body.py`. Archive SHA-256 is `2125f6d761b14ead4ee64f71713f56f3f0f29982693ff20aac63474470cb92f4`; all three source hashes and URLs are embedded in the output. A changed source fails the build. The historical CC BY-SA 2.1 Japan attribution remains in the bundle and [LICENSES/BodyParts3D.md](LICENSES/BodyParts3D.md).

- Binary: **920,028 bytes**; JSON: **93,624 bytes**; combined: **1,013,652 bytes**.
- Binary SHA-256: `260df558794972c6fcc3d6d566302c45e62647c8dafd8485e472012970875e0d`.
- All 114 source components have positive triangle counts; palm components retain
  all 4,974 source triangles. The largest mesh has 24,563 vertices.
- Current rebuilt head hashes are recorded in `registration.targetHashes`; source
  ownership is independent of the simplified overview triangle indices.

## Head registration evidence

All head elements use the single fixed similarity transform in `tools/head_frame.py`.
It was fitted only between the pinned BodyParts3D skin and MediaPipe canonical
face. Scale is **1.1412436275406224**. Complete coefficients, reproducibility
checks and the untrimmed frontal-surface acceptance are in `NOTES.rebuild.md`.
No per-component fitting or source-identity inference occurs.

The following deterministic nearest-vertex comparisons use the independently
rebuilt overview as the target. Legacy JSON field names `sourceToOriginal` and
`originalToSource` now mean source-to-overview and overview-to-source. They do
not refer to prototype geometry. Residuals include independent simplification
and vertex spacing; they are not patient-specific alignment measurements.

| Parent | Source → overview RMS / P95 | Overview → source RMS / P95 |
| --- | --- | --- |
| muscles | 0.14923 / 0.31011 cm | 0.04673 / 0.10481 cm |
| cranium | 0.07933 / 0.13736 cm | 0.04272 / 0.07292 cm |
| jaw | 0.04555 / 0.08879 cm | 0.02071 / 0.04417 cm |

## Palm and finger registration evidence

The 21 `handReference` points are computed from right-hand bone end surfaces
by `tools/hand_frame.py`. The wrist is the midpoint of opposing radiocarpal
patches. Palm basis columns are index MCP minus wrist, little MCP minus wrist,
and their normalized cross product times the geometric mean of the two lengths.
The JSON records the independent origin and basis. Palm nearest-vertex RMS is
**8.92e-6** source-to-overview and **9.15e-6** overview-to-source in dimensionless
rig units, consistent with position quantization.

Finger frames use the full joint-pair length and projected knuckle direction.
Runtime local X endpoints 0 and 1 match the two tracked landmarks; terminal
bones are not shortened. Python and JavaScript share the documented basis and
bilateral numerical tests. Source identity and mirrored-side terminology remain
separate from geometry registration.

All hand parts retain the real **right-source** `id/name`, `sourceSide: "R"` and `mirroredForLeft: true`. `pairedId/pairedName` come from the actual left atlas inventory and allow correct displayed-side terminology, but do not claim that mirrored right-source geometry is a separately loaded left specimen. Runtime should preserve this distinction when showing source provenance.

## Rebuild and checks

```sh
tools/.venv/bin/python tools/build_individual_head.py
tools/.venv/bin/python tools/build_individual_head.py --verify --no-previews
npx vitest run tests/unit/individual-head-assets.test.js
```

A separate `--verify` run reproduced both JSON and binary byte-for-byte. Six focused unit checks passed: source/target hashes and size, exact coverage, exclusive contiguous triangle/vertex ownership, unchanged finger mapping, right-source reflection and numeric drift bounds, and decoding with the production loader into finite positions/normals. Existing anatomical assets were checked unchanged by the builder.

Three orthographic source previews for each of the four parents were visually inspected under `tools/out/preview_individual_*.png`. They show separated source components and coherent skull, dental, muscle and carpal geometry. This source inspection does not verify live camera placement, patient anatomy, physical device behavior or clinical accuracy.
