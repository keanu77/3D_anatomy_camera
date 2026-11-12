# Regional muscle assets

`tools/build_muscles.py` derives the independent `public/anatomy/muscles.json` and `muscles.bin` bundle from actual BodyParts3D 3.0 OBJ surfaces. It uses the pinned atlas and source reference frames in `build_body.py`, with no generated anatomical shapes or reflected replacement sides. The existing head/body files remain byte-identical.

## Delivered scope

The bundle contains 24 bilateral regional meshes from 276 unique source OBJ components. A source component is an atlas part, sometimes a muscle head or subdivision, rather than a count of distinct named muscles.

| Bilateral region | Source components | Triangles, both sides | Frame |
| --- | ---: | ---: | --- |
| Neck: sternocleidomastoid and scalenes | 8 | 7,000 | Torso |
| Chest: pectorals, serratus anterior, subclavius | 12 | 14,000 | Torso |
| Back: trapezius, latissimus, rhomboids, scapular elevators, posterior serrati, spinal groups | 46 | 20,000 | Torso |
| Abdominal wall and quadratus lumborum | 10 | 13,000 | Torso |
| Scapular: supraspinatus, infraspinatus, subscapularis, teres minor/major | 10 | 12,000 | Torso |
| Deltoid | 6 | 7,000 | Shoulder–elbow |
| Upper arm: biceps, brachialis, coracobrachialis, triceps | 14 | 12,000 | Shoulder–elbow |
| Forearm: flexors, extensors, pronators and supinator | 48 | 18,000 | Elbow–wrist |
| Hip/gluteal: gluteals, iliopsoas and short external rotators | 20 | 14,000 | Torso |
| Thigh: quadriceps, hamstrings, adductors, sartorius and tensor fasciae latae | 34 | 20,000 | Hip–knee |
| Lower leg: anterior, lateral and posterior groups | 28 | 16,000 | Knee–ankle |
| Intrinsic foot muscles, including lumbricals and interossei | 40 | 8,000 | Ankle/heel/toe |
| **Total** | **276** | **161,000** | |

The complete individual source ID/name inventory is embedded in each mesh's `sourceElements` and `sourceConcepts`; the deduplicated 276-ID inventory is `source.elementIds`. Selected hierarchy concepts are separately recorded in `selectedFamilies`, so an aggregate family is not misrepresented as an OBJ file. Examples include left/right rectus abdominis `FMA13378`/`FMA13377`, latissimus dorsi `FMA13359`/`FMA13358`, gluteus maximus `FMA22329`/`FMA22328`, and soleus `FMA22559`/`FMA22558`. Extensor carpi ulnaris uses the actual `BP44`–`BP47` source heads because the generic alias does not resolve the full pair.

Excluded from this bundle: intrinsic hand muscles; facial/masticatory muscles already available through the original head layer; internal thoracic/intercostal muscles, diaphragm, pelvic floor and perineum; deep suboccipital, hyoid and individual segmental spinal muscles; standalone tendons, retinacula and fascial sheets. Some source muscle OBJ surfaces include their tendon portions, including extensions into the fingers/toes.

## Source, rights and coordinates

- Official archive: [BodyParts3D 3.0, 2011-09-15, 99% OBJ](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_99.zip), SHA-256 `2125f6d761b14ead4ee64f71713f56f3f0f29982693ff20aac63474470cb92f4`.
- Official parts list SHA-256 `824a34ed939a53375037d0d68b88ad2b63b1f0ae15a585632af2a63c2ab2e4af`; hierarchy SHA-256 `17cd3611eb6b46558f983f890273fdb19f93806150ed95f6611acf4b81e90bc2`. Exact URLs are recorded in `muscles.json`.
- Preserve the historical source's **CC BY-SA 2.1 Japan** attribution. See [BodyParts3D license record](LICENSES/BodyParts3D.md) for the historical grant and the distinct current licensing page. Geometry is decimated, transformed and quantized from that source.
- Source millimeters map to centimeters by `[x, z, -y] / 10`; positive X remains anatomical left. Each side must have both an explicit source-side name and a correctly signed source centroid. No contralateral mirror is generated.
- Source references and demo pose exactly match `body.json`; runtime muscles are independently loadable and include their own `demoPose`/`demoAspect`.

## Format and limitations

All meshes use the existing little-endian unsigned-16-bit positions and indices format with even byte offsets. Positions dequantize through `min`/`size`, then use torso, bone or foot bases. Maximum mesh vertex count is **5,323**, below the 65,535 limit. Labels use surface points and concise regional names.

This is a rigid educational overlay of reference adult anatomy. It does not estimate patient-specific muscle position or volume, contraction, strength, pathology, muscle bulging, tendon sliding, tissue collisions or skin deformation. Multi-joint muscles keep their source shapes as joints move. Scapular and hip regions follow the torso; forearm rotation and individual finger/toe movement are approximate. Neck muscles follow the torso. `jointAnchors` are companion skeletal reference joints, **not** muscle origins or insertions. Regional labels do not identify every individual muscle.

## Reproduction and checks

```sh
tools/.venv/bin/python tools/build_muscles.py
tools/.venv/bin/python tools/build_muscles.py --verify --no-previews
```

Dependencies are pinned in `tools/requirements-body.txt`. Download caches, virtual environment and generated previews remain ignored. `--verify` compares both generated files byte-for-byte and checks the original four head/body artifacts were not modified.

Verified output: `muscles.bin` **1,463,556 bytes**, `muscles.json` **103,425 bytes**, combined **1,566,981 bytes** (under the 3 MB budget). Binary SHA-256: `d7b85c252518916e7ed05df98e96ea99d3c736e173332417678e9a0bf3fd8d6d`.

The deterministic rebuild and 24-mesh structural checks passed: finite frames/positions, even offsets, index bounds, vertex/triangle budgets, matching demo/reference frames, unique source components, valid label references and unchanged original assets. Source previews were visually inspected for coherent extent and bilateral placement: `tools/out/preview_muscles_front.png`, `preview_muscles_back.png`, `preview_muscles_side.png`, and all 12 `preview_muscles_region_*.png` files. Regional previews contain three views each. These source-space previews and binary checks do not establish live camera registration, anatomical measurement accuracy or clinical validation.
