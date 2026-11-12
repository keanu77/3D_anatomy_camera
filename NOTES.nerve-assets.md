# Neural and visual-pathway assets

`tools/build_nerves.py` builds `public/anatomy/nerves.json` and `nerves.bin` from actual reference surfaces. The package contains **9 meshes, 35 source components and 27,566 triangles**, with 253,728 binary bytes and approximately 410 KB including metadata. Existing head, body, muscle and joint bundles remain byte-identical. No generated tube, reflected substitute nerve or synthetic anatomical primitive is used.

## Actual coverage

| Delivered region | Actual source components | Runtime frame |
| --- | ---: | --- |
| Cervical spinal cord | C1–C8: 8 | Torso; cervical visibility guard |
| Thoracic spinal cord | T1–T12: 12 | Torso |
| Lumbar spinal cord | L1–L5: 5 | Torso |
| Sacral spinal cord | S1–S5: 5 | Torso |
| Left/right optic nerves | 2 | Tracked head |
| Optic chiasm | 1 | Tracked head |
| Left/right optic tracts | 2 | Tracked head |

Cord names refer to **spinal cord segments**, not vertebrae with the same ordinal number. The 30 HRA source surfaces are grouped into four rendering meshes without decimation; their original triangle topology is retained. The GLB has no separately named coccygeal segment and no cauda-equina nerve-root surfaces.

BodyParts3D optic source IDs are `FMA50878` / `FMA50875` (left/right optic nerves), `FMA62045` (chiasm) and `FMA67936` / `FMA62382` (left/right optic tracts). Existing original brain and eyeball layers remain separate. This package does not add peripheral limb nerves, spinal nerve roots, retinal layers or auditory/vestibular organs.

The official BodyParts3D 3.0 hierarchy's `spinal cord` alias (`FMA7647`) resolves only `FMA78497`, a central-canal surface approximately **3.36 cm** long. It is deliberately excluded as a misleading substitute for a full cord. The cached 4.0 counterpart was also a short canal surface. This is why the complete cord comes from HRA.

## Provenance and licences

The cord uses **Browne, Kristen; Schlehlein, Heidi (2022), _3D Reference Organ for Spinal Cord, Male, v1.0_, HuBMAP**, reviewer Vilas Menon, DOI [10.48539/HBM366.MTJD.685](https://doi.org/10.48539/HBM366.MTJD.685), licensed **CC BY 4.0**. Its upstream reference is the NLM Visible Human male dataset. See the [official metadata](https://cdn.humanatlas.io/hra-releases/v2.0/markdown/ref-organs/3d-vh-m-spinal-cord.md) and [official GLB](https://cdn.humanatlas.io/hra-releases/v1.2/models/VH_M_Spinal_Cord.glb).

- Cached file: `tools/cache/HRA_VH_M_Spinal_Cord_v1.glb`, 489,992 bytes.
- SHA-256: `a7858d88c2237aa7d559c4c1d638923d213d2a9f46c575dea03d6ba67a9975c0`.
- The file contains exactly 30 geometry components, identity node transforms and metre units.
- HRA licence/attribution record: [LICENSES/HRA-spinal-cord.md](LICENSES/HRA-spinal-cord.md).

The optic structures use the pinned [BodyParts3D 3.0 archive](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_99.zip), SHA-256 `2125f6d761b14ead4ee64f71713f56f3f0f29982693ff20aac63474470cb92f4` (all inventory-source hashes are also in `build_body.py` and bundle metadata). They preserve the historical **CC BY-SA 2.1 Japan** grant and attribution documented in [LICENSES/BodyParts3D.md](LICENSES/BodyParts3D.md). Each delivered mesh records its applicable licence, actual source IDs and names; the combined bundle does not erase these distinct upstream grants.

## Cross-atlas cord registration

The HRA cord and BodyParts3D skeleton are different reference specimens. The source GLB cord's superior/inferior extent is **46.5183 cm**. Its actual cross sections are uniformly scaled by approximately 0.8969 and recentered along a measured BodyParts3D vertebral-canal centerline. The target superior/inferior extent is **41.7237 cm**, from the measured C1 canal plane at `y=147.7549 cm` to the measured L1 canal plane at `y=106.03116 cm`.

The builder cuts each real vertebral source mesh at 81 horizontal planes across its middle 80% and finds closed central lumens nested within the outer bone section. It selects the largest qualifying central lumen, recording its polygon and center. Nineteen levels produced measurable enclosed holes. The T12 plane did not; its centerline portion interpolates adjacent T11/L1 measurements and is explicitly listed in `unmeasuredVertebrae`.

The HRA source centerline is measured from actual triangle-plane intersections at 181 axial levels. For each original vertex, the builder scales its superior/inferior position, preserves its scaled transverse offset from that source centerline, and recenters it on the target canal centerline. All original source faces remain. Thus the operation is an explicit anatomical reference fit with axial/transverse scaling and centerline adaptation, not unchanged specimen anatomy or patient calibration.

The target physical bounds are approximately `[-0.9621, 106.0312, 2.5457]` to `[0.5614, 147.7549, 8.6585]` cm. At the 19 measured canal planes, **all 1,866 transformed source-section points lie inside the measured lumen polygons**; the minimum sampled clearance is **0.1380 cm**. These checks are limited to sampled planes, not a proof of collision-free placement throughout the canal. All polygons, centers, native centerline samples, transformations and per-plane results are embedded in `registration.cord` for independent reconstruction.

## Optic-pathway head registration

One proper similarity transform maps BodyParts3D source centimetres into the
MediaPipe canonical-face space. `tools/head_frame.py` is its sole source; the
fixed scale is **1.1412436275406224**. Fitting used the source skin and pinned
public canonical face only. `NOTES.rebuild.md` documents the method and frontal
surface acceptance. Rebuilds validate fixed coefficients rather than refitting.

`registration.head` records the transform, independently rebuilt target hashes
and deterministic nearest-vertex comparisons against the new head overview:

| Reference surface | RMS | 95th percentile |
| --- | ---: | ---: |
| Eyes | 0.06063 cm | 0.11067 cm |
| Cerebrum | 0.07690 cm | 0.15532 cm |
| Hindbrain | 0.07582 cm | 0.13982 cm |

These are source-surface registration residuals, not patient or clinical accuracy. Sampling/decimation also affects nearest-vertex distance. All five optic components receive the same transform, preserving their relative anatomy. They use `frame: "head"`, canonical local centimetres and the existing face-tracked head group; they must remain visible with a valid face even when full-body Pose is absent. The cord follows the torso separately. Optical structures do not track gaze or eyeball rotation.

## Rebuild and evidence

```sh
tools/.venv/bin/python tools/build_nerves.py
tools/.venv/bin/python tools/build_nerves.py --verify --no-previews
```

The deterministic rebuild passed byte-for-byte, and the builder verified unchanged existing anatomical assets. Every mesh stays below 65,535 vertices, uses aligned unsigned-16-bit positions/indices, and records its source frame and registration. Source previews were visually inspected at `tools/out/preview_nerves_cord_front.png`, `preview_nerves_cord_side.png` and `preview_nerves_optics.png`. They show the cord within the reference vertebral canal and the optic structures aligned with the independently rebuilt eyes/brain. The previews and numerical registration checks do not establish live camera accuracy, clinical validity or device performance.

An independent audit reconstructed all nine meshes and confirmed their original vertex counts and exact source triangle indices. Maximum decoded position quantization error was **0.000180 cm**. A denser check against actual vertebral surfaces sampled **820 planes / 88,408 section endpoints**: two planes exceeded 0.2 mm boundary overlap, with maxima **0.305 mm at the axis** and **0.209 mm at C5**, below the builder's declared 0.5 mm reference-fit tolerance. This tolerance is an engineering check, not a clinically justified accuracy threshold. It also confirms why the 1.38 mm clearance statistic must remain scoped to the 19 registration planes. Independent evidence is `tools/out/review_nerves_independent.json`.

During runtime the cord remains a rigid torso region: it does not flex at individual spinal levels. This release does not model nerve tension, sliding, tissue interaction or pathology. Missing neural and sensory structures remain explicitly excluded.

Synthetic Chromium/SwiftShader visual review also passed without page errors. The actual nervous preset rendered five head optic meshes and four torso cord meshes in X-ray and solid styles. The combined preset rendered spine 2 / arms 4 / legs 6 / body muscles 24 / joints 15 / nerves 9, with organs disabled. Mobile portrait labels stayed on-screen. An isolated renderer preview, using the same source modules and synthetic demo head with no body pose, retained all five optics with `nerveBodyVisible: 0` and `poseFound: false`; a turned-head view confirmed the optics move with the head. Screenshots are `tools/out/runtime-nerves-{nervous,systems}-{xray,solid}.png`, `runtime-nerves-systems-mobile.png` and `runtime-nerves-head-{xray,solid,turned}.png`. No human-camera fixtures were captured. At full-body scale the thin cord is subtle in X-ray, and the head veil partly covers its upper portion; the displayed brainstem/cord junction is an approximate tracking alignment, not a seamless deforming connection.
