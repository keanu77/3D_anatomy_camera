# Selected joint and connective-tissue assets

`tools/build_joints.py` creates independent `public/anatomy/joints.json`/`joints.bin` assets from **49 actual BodyParts3D 3.0 OBJ components**, grouped into **15 rigid meshes**. The layer contains the available spinal disks, costal cartilage and selected ligaments, tendons and membranes. It is not a complete joint atlas. No surrogate geometry fills gaps in the source.

## Exact delivered inventory

| Region | Meshes / components | Actual OBJ IDs | Frame |
| --- | --- | --- | --- |
| Cervical disks | 1 / 6 | FMA25058, FMA13896, FMA13897, FMA13898, FMA13899, FMA13900 | Torso, cervical flag |
| Thoracic disks | 1 / 12 | FMA10458, FMA13495, FMA13500, FMA13501, FMA13502, FMA13503, FMA13504, FMA13505, FMA13506, FMA13507, FMA13508, FMA13509 | Torso |
| Lumbar disks | 1 / 5 | FMA16033, FMA16034, FMA16035, FMA16036, FMA16037 | Torso |
| Left costal cartilage | 1 / 8 | BP24, FMA8005, FMA8031, FMA8058, FMA8167, FMA8112, FMA8221, FMA8275 | Torso |
| Right costal cartilage | 1 / 8 | BP28, FMA7875, FMA7886, FMA7913, FMA7976, FMA8070, FMA8194, FMA8248 | Torso |
| Inguinal ligaments | 2 / 2 | Left FMA21965; right FMA21964 | Torso |
| Forearm interosseous membranes | 2 / 2 | Left FMA23708; right FMA23707 | Elbow–wrist |
| Leg interosseous membranes | 2 / 2 | Left FMA35193; right FMA35192 | Knee–ankle |
| Calcaneal/Achilles tendons | 2 / 2 | Left FMA264844; right FMA258847 | Knee–ankle |
| Long plantar ligaments | 2 / 2 | Left FMA44250; right FMA44249 | Ankle/heel/toe |

Source names are preserved individually in each mesh's `sourceConcepts`; `sourceElements` and top-level `source.elementIds` provide the complete machine-readable inventory. The disk names follow the atlas convention, including “intervertebral disk of axis.” Costal cartilage includes the two `BP` components in addition to the fourteen separately numbered components: the aggregate “costal cartilage” concept alone resolves only the latter fourteen.

The supplied 3.0 named OBJ inventory has no separately named knee/shoulder/hip articular cartilage, menisci, labra, cruciate ligaments or collateral ligaments. The layer must not be described as containing these structures. Source inventory review also found nasal cartilage FMA71704, thyroid cartilage FMA55099, intermediate neck tendons FMA258850/FMA264840, wrist flexor retinacula FMA40120/FMA40121, and pelvic tendinous arch FMA46442; these are excluded from this scoped torso/limb bundle. The broad “articular system” hierarchy also includes gingiva, so it was not blindly imported.

## Provenance and preservation

The archive, English parts list and composite hierarchy are pinned to the same official 2011-09-15 BodyParts3D 3.0 downloads as the existing body and muscle builds. The [official OBJ archive](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_99.zip) SHA-256 is `2125f6d761b14ead4ee64f71713f56f3f0f29982693ff20aac63474470cb92f4`. All three exact source URLs and hashes are recorded in `joints.json`.

Geometry is decimated, transformed from millimeters by `[x, z, -y] / 10`, and quantized. Historical **CC BY-SA 2.1 Japan** attribution is retained; see [the source licensing record](LICENSES/BodyParts3D.md). Every delivered component must exist as an OBJ, every bilateral part retains its source side, and no source component duplicates the existing body bundle. The six existing head/body/muscle artifacts are checked for unchanged hashes before and after the build.

## Runtime contract and limits

The format matches the existing quantized unsigned-16-bit bundle: even offsets, indices within each mesh, `min`/`size` position decoding, and `layer: "joints"`. Midline disk groups use `side: "M"`; bilateral groups use `L`/`R`. Bone meshes include two pose landmarks; foot meshes use ankle, heel and toe. Source references and demo pose exactly match `body.json`; the standalone bundle supplies its own demo data. Bone `jointAnchors` are skeletal reference positions, not measured tissue attachment sites.

This educational atlas does not estimate individual joint anatomy, ligament injury or tendon pathology. Disks move with the torso rather than individual vertebrae. Achilles tendons follow the lower leg across the ankle, and plantar ligaments move rigidly with the foot. No ligament tension, tendon sliding or deformation is simulated. Muscle source surfaces may already contain tendon portions; visual overlap does not establish separate anatomical tissue compartments.

## Reproduction and evidence

```sh
tools/.venv/bin/python tools/build_joints.py
tools/.venv/bin/python tools/build_joints.py --verify --no-previews
```

The script reuses the existing atlas/reference functions and `build_muscles.source_frame`; dependencies remain in `tools/requirements-body.txt`.

Verified result: **70,500 triangles**, maximum **7,085 vertices per mesh**, binary **636,846 bytes**, metadata **39,827 bytes**, combined **676,673 bytes**. Binary SHA-256: `741c60cfab6fabdf55e5e0e06b7ad2fd1df05954a9f8e9b325fe3b6ff738cad8`.

Byte-identical rebuild passed. All 15 meshes passed finite-geometry/frame, positive-basis determinant, offset, index, vertex/triangle-budget and layer checks. All 49 source IDs are unique, label mesh references exist, and the companion demo/reference arrays match exactly. Existing head/body/muscle artifacts remained unchanged.

Visually inspected `tools/out/preview_joints_front.png`, `preview_joints_back.png`, `preview_joints_side.png` and all nine `preview_joints_region_*.png` three-view panels. Source-space silhouettes and bilateral placement are coherent. These previews do not validate live-camera registration or clinical measurement accuracy. Generated previews/cache remain ignored.
