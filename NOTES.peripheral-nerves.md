# Peripheral nerves (v2.6, extended in v2.10)

Added because BodyParts3D 3.0/4.0 has no limb nerves. Source and licence: `LICENSES/Z-Anatomy.md`.

## What the source is

Z-Anatomy `Startup.blend` (Blender 3.5) holds 241 nerve objects as non-cyclic Bezier curves, each with a uniform 0.5 mm bevel and a per-point relative radius. They are illustrated atlas courses, not surfaces and not segmentation. This build uses 111 names: brachial plexus roots, trunks, divisions and posterior cord with their branches, the long nerves of the arm, the lumbar and sacral plexus branches, the nerves of the leg and foot, and since v2.10 the intercostal nerves, 21 cranial nerves and trigeminal branches, and 8 nerves of the hand.

Not used: the optic nerve curve (the optic pathway is published as real surfaces in `nerves.json`), the cochlear nerve (drawn on one side only), the vagus and accessory nerves (they run from the skull into the trunk, across two separately tracked frames), phrenic and sympathetic nerves, spinal roots, and the left-hand objects (see below). The source draws no inferior gluteal nerve and no separate lateral or medial cord. `Medial crural cutaneous branches of saphenous nerve` is excluded because its curve lies in the upper medial thigh.

## Build (`tools/build_peripheral_nerves.py`)

1. Read curve control points and bone bounding boxes straight from the `.blend` with `blender-asset-tracer` (no Blender needed). Parsed curves are cached in `tools/cache`.
2. Register to the BodyParts3D atlas frame (cm, x = left, y = up, z = anterior): axes `(x, z, -y) * 100`, then one uniform scale and translation per limb and side, least-squares on bounding boxes of matched unrotated bones. Z-Anatomy mirrors one body half, so a single whole-body fit left up to 6.5 mm on the fibula; per-limb fits give mean 0.2 mm / max 1.0 mm (upper) and mean 0.6 mm / max 4.0 mm (lower, worst bone fibula). The build fails above 5 mm max or 1.2 mm mean. Residuals are written into `peripheral.json`.
3. Cut into segments. Limb versus trunk goes by the nearer skeleton (limb bones versus torso skeleton), smoothed over about 2 cm; elbow, wrist, knee and ankle use the same landmark frames as the muscles. Neighbouring pieces share their boundary sample, so the reference pose has no gaps.
4. Sweep five-sided tubes. Radius = source radius x bevel x 2, limited to 1.2-5.5 mm. This is an exaggeration for visibility, not calibre.
5. Each nerve is a contiguous index range with `id = Z-Anatomy:<object name>`; the app uses these ranges directly for picking and region focus, without the individual-body bundle.

Output: 34 meshes (8 limb and trunk segments x 2 sides, 2 head meshes, 16 hand meshes), about 0.48 MB binary + 0.20 MB metadata. `--verify` rebuilds byte-identically.

## Trunk, head and hand (v2.10)

- **Intercostal nerves** are one source object per side with eleven courses. They are registered to the ribs of their side (eleven ribs; the sixth is a rotated object in the source and cannot be a reference; mean 0.1 mm, max 1.3 mm) and ride on the torso frame as `pn_trunk_L/R`.
- **Cranial nerves** are registered to fourteen skull bones with one fit for both sides (mean 0.3 mm, max 2.3 mm at the left maxilla), then taken into the head model's own coordinates with the fixed transform of `build_nerves.py`, the one the optic pathway uses. They are `frame: "head"` meshes `pn_head_L/R`: rigid with the skull, so they follow the tracked head but not the jaw, the eyes or expression. The glossopharyngeal and hypoglossal courses reach a few centimetres below the skull and move with the head, not the neck.
- **Hand nerves** ride on the hand rig, which is tracked separately from the body and whose meshes were authored on the BodyParts3D right hand in frames given by `head.json`'s `demoHand` landmarks. The build recomputes those frames (palm block and fifteen finger bones), checks each against the published bone mesh, registers the right-hand curves to 26 right-hand bones (max 0.05 mm), assigns every sample to its nearest bone group and writes one mesh per rig piece (`pn_hand_palm`, `pn_hand_b_5_6`, ...) with `frame: "hand"`. A right forearm nerve that continues past the wrist (median, palmar and dorsal branches, superficial radial) goes on into the palm mesh.
- The runtime draws every hand mesh on both hand rigs as a child of the matching bone mesh. The rig shows a left hand as the mirrored right hand, so the left hand shows the right hand's nerves mirrored; each part carries `pairedId`/`pairedName` and is reported with the left identity there, as the hand bones are. The source's own left-hand objects are not used.
- Hand nerves need the hand layer and a tracked hand. They are not cut by the reveal plane, like the hand bones.

## Checks

`tests/unit/peripheral-nerves.test.js` decodes the published buffers back to the reference pose and checks side, continuity across every cut, and relations to bones (ulnar nerve medial and posterior at the elbow and running with the ulna; sciatic behind the femur dividing above the knee; common fibular round the fibular neck; tibial behind the tibia; femoral in front of the hip bone; plexus roots beside C6 and the posterior cord below the clavicle). These guard registration and segmentation. They do not make the hand-drawn courses clinically accurate.

## Limits

- Nerves separate at a bent joint because segments are rigid; thin lines show this more than muscles do.
- In region focus nerves are optional (`OPTIONAL_FOCUS_LAYERS`), because their names would crowd out the muscle names.
- Hand nerves do not meet the forearm nerves: the hand rig and the body pose are tracked independently, as the hand and forearm bones already are. Finger nerves separate at a bent finger joint.
- Chinese names in `src/nerve-names.js` were written by Claude and have not been reviewed by a second anatomist. The thirty names added in v2.10 were not checked against 樂詞網.
