#!/usr/bin/env python3
"""Derive peripheral nerves of the limbs, trunk wall, head and hand from the pinned Z-Anatomy Blender file.

Z-Anatomy draws each nerve as a Bezier curve with a relative radius; it is an
illustrated atlas course, not a segmentation. The curves are registered to the
BodyParts3D skeleton already used by this project through matched bones, cut at
the joints into the same rigid tracking segments as the muscles, and swept into
tubes whose thickness is exaggerated so they remain visible on a camera picture.

Usage (from repo root):
  tools/.venv/bin/pip install -r tools/requirements-peripheral.txt
  tools/.venv/bin/python tools/build_peripheral_nerves.py [--verify] [--no-previews]
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import subprocess
import zipfile
from pathlib import Path

import numpy as np

from build_body import Atlas, CACHE, OUT, PREVIEWS, demo_pose, fetch_sources, reference_points, sha, torso_basis
from hand_frame import FINGERS, PALM, hand_frame, raw_mm, to_palm, hand_frames
from build_muscles import source_frame
from build_nerves import head_geometry
from head_frame import HEAD_SCALE, to_head, verify_registration

COMMIT = "bb293be456f6d2245191f37752d14ec76894740d"
ARCHIVE_URL = f"https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/{COMMIT}/Z-Anatomy.zip"
ARCHIVE_SHA256 = "e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736"
BLEND_MEMBER = "Z-Anatomy/Startup.blend"
BLEND_SHA256 = "9f08a17ea0115fed80b2a73ecdf0a1bc2ab2f6956f37c593ce23d513ea35afcd"
ARCHIVE = CACHE / f"Z-Anatomy-{COMMIT[:8]}.zip"
CURVES = CACHE / f"z-anatomy-nerve-curves-{COMMIT[:8]}.json"
ATTRIBUTION = ("Peripheral nerve courses: Z-Anatomy, the libre 3D atlas of anatomy (Gauthier Kervyn and contributors), "
               "licensed under CC BY-SA 4.0, itself derived from BodyParts3D, © The Database Center for Life Science, "
               "CC BY-SA 2.1 Japan. Curves registered to the BodyParts3D skeleton, cut into tracking segments, swept "
               "into tubes with exaggerated thickness and quantized for Anatomy Mirror. This adapted data is offered "
               "under CC BY-SA 4.0.")

# chain: which rigid segments a nerve may be cut into, proximal to distal.
BRACHIAL = [
    "Roots of brachial plexus", "Superior trunk of brachial plexus", "Middle trunk of brachial plexus",
    "Inferior trunk of brachial plexus", "Anterior division of superior trunk of brachial plexus",
    "Posterior division of superior trunk of brachial plexus", "Anterior division of middle trunk of brachial plexus",
    "Posterior division of middle trunk of brachial plexus", "Anterior division of inferior trunk of brachial plexus",
    "Posterior division of inferior trunk of brachial plexus", "Posterior cord of brachial plexus",
    "Dorsal scapular nerve", "Long thoracic nerve", "Suprascapular nerve", "Subclavian nerve", "Lateral pectoral nerve",
    "Medial pectoral nerve", "Superior subscapular nerve", "Inferior subscapular nerve", "Thoracodorsal nerve",
]
ARM = [
    "Axillary nerve", "Muscular branches of axillary nerve", "Superior lateral brachial cutaneous nerve",
    "Musculocutaneous nerve", "Lateral antebrachial cutaneous nerve", "Median nerve",
    "Anterior interosseous nerve of forearm", "Muscular branches of median nerve", "Palmar branch of median nerve",
    "Ulnar nerve", "Muscular branches of ulnar nerve", "Dorsal branch of ulnar nerve", "Palmar branch of ulnar nerve",
    "Radial nerve", "Muscular branches of radial nerve", "Deep branch of radial nerve",
    "Superficial branch of radial nerve", "Posterior interosseous nerve of forearm",
    "Inferior lateral brachial cutaneous nerve", "Posterior antebrachial cutaneous nerve",
    "Medial brachial cutaneous nerve", "Medial antebrachial cutaneous nerve",
    "Anterior branch of medial antebrachial cutaneous nerve", "Posterior branch of medial antebrachial cutaneous nerve",
]
LUMBOSACRAL = [
    "Iliohypogastric nerve", "Ilio-inguinal nerve", "Pudendal nerve", "Superior gluteal nerve",
    "Nerve to piriformis muscle", "Nerve to quadratus femoris muscle",
]
LEG = [
    "Genitofemoral nerve", "Femoral branch of genitofemoral nerve", "Genital branch of genitofemoral nerve",
    "Lateral femoral cutaneous nerve", "Femoral nerve", "Anterior cutaneous branches of femoral nerve",
    "Saphenous nerve", "Infrapatellar branch of saphenous nerve",
    "Obturator nerve", "Anterior branch of obturator nerve", "Posterior branch of obturator nerve", "Sciatic nerve",
    "Posterior femoral cutaneous nerve", "Tibial nerve", "Common fibular nerve", "Superficial fibular nerve",
    "Deep fibular nerve", "Muscular branches of deep fibular nerve", "Sural nerve", "Medial sural cutaneous nerve",
    "Sural communicating branch of common fibular nerve", "Medial plantar nerve", "Lateral plantar nerve",
    "Medial dorsal cutaneous nerve of foot", "Intermediate dorsal cutaneous nerve of foot",
    "Common plantar digital branches of medial plantar nerve", "Common plantar digital branches of lateral plantar nerve",
    "Proper plantar digital branches of medial plantar nerve", "Proper plantar digital branches of lateral plantar nerve",
    "Dorsal digital branches of deep fibular nerve", "Dorsal digital branches of superficial fibular nerve",
]
# Nerves of the trunk wall: they stay with the torso and are registered to the rib cage, not to a limb.
TRUNK = ["Intercostal nerves"]
# Cranial nerves and the branches of the trigeminal nerve: rigid with the skull, shown on the tracked head.
HEAD = [
    "Olfactory nerve (I)", "Oculomotor nerve (III)", "Trochlear nerve (IV)", "Trigeminal nerve (V)", "Ophthalmic nerve",
    "Maxillary nerve", "Meningeal branch of maxillary nerve", "Anterior division of mandibular nerve",
    "Posterior division of mandibular nerve", "Buccal nerve", "Lingual nerve", "Inferior alveolar nerve", "Mental nerve",
    "Nerve to mylohyoid muscle", "Abducens nerve (VI)", "Facial nerve (VII)", "Chorda tympani",
    "Vestibulocochlear nerve (VIII)", "Vestibular nerve", "Glossopharyngeal nerve (IX)", "Hypoglossal nerve (XII)",
]
# Nerves that lie wholly in the hand. Only the right-hand objects are used: the hand rig shows the left hand
# as the mirrored right hand, bones and nerves alike.
HAND = [
    "Deep branch of ulnar nerve", "Superficial branch of ulnar nerve", "Common palmar digital branches of median nerve",
    "Proper palmar digital branches of median nerve", "Common palmar digital branches of ulnar nerve",
    "Proper palmar digital branches of ulnar nerve", "Dorsal digital branches of radial nerve",
    "Dorsal digital branches of ulnar nerve",
]
CHAIN = {**{n: "trunk" for n in TRUNK}, **{n: "head" for n in HEAD}, **{n: "hand" for n in HAND}, **{n: "brachial" for n in BRACHIAL}, **{n: "arm" for n in ARM}, **{n: "lumbosacral" for n in LUMBOSACRAL}, **{n: "leg" for n in LEG}}
EXCLUDED = [
    "Optic nerve curve (the optic pathway is published separately as real surfaces); cochlear nerve (drawn on one side only)",
    "Vagus and accessory nerves (they run from the skull into the trunk, across two separately tracked frames)",
    "Left-hand nerve objects (the hand rig mirrors the right hand); the variant communicating branch between median and ulnar nerves",
    "Phrenic and sympathetic nerves; spinal nerve roots and cauda equina",
    "Inferior gluteal nerve and separate lateral/medial cords of the brachial plexus: not drawn as curves in the source",
    "Source object 'Medial crural cutaneous branches of saphenous nerve': its curve lies in the upper medial thigh, which contradicts its name, so it is not published",
]
LIMITATIONS = [
    "Illustrated atlas courses drawn as curves by the Z-Anatomy authors; not segmented from imaging and not patient-specific.",
    "Tube thickness is exaggerated for visibility (source relative radius x 0.1 cm, limited to 0.12-0.55 cm) and does not show true nerve calibre.",
    "Nerves are cut at the shoulder/hip, elbow, wrist, knee and ankle and follow rigid segments, so they separate at a bent joint.",
    "Registration to the BodyParts3D skeleton is one similarity transform fitted to matched bone bounding boxes; residuals are recorded in this file.",
    "Forearm courses end at the wrist. Hand and finger nerves follow the separately tracked hand rig, piece by piece with the palm and each finger bone, so they do not join the forearm nerves and they separate at a bent finger joint. The left hand shows the right hand's nerves mirrored. Foot branches follow the foot as one rigid region.",
    "Cranial nerves are rigid with the skull: they follow the tracked head but not jaw opening, eye movement or facial expression. They use the same fixed head registration as the optic pathway.",
    "Intercostal nerves follow the torso as one rigid piece and do not move with breathing or with bending of the spine.",
    "Educational visualization only; not for nerve block guidance, surgical planning or diagnosis.",
]
# Bones present in both atlases under these names, used to fit and to check the registration.
REGISTRATION = dict(upper=["clavicle", "scapula", "humerus", "radius", "ulna"], lower=["hip bone", "femur", "tibia", "fibula", "talus", "calcaneus", "patella"],
                    # The sixth rib is a rotated object in the source and cannot serve as a reference.
                    trunk=[f"{n} rib" for n in ("first", "second", "third", "fourth", "fifth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth")])
LIMB = dict(brachial="upper", arm="upper", lumbosacral="lower", leg="lower", trunk="trunk")
# (Z-Anatomy object, BodyParts3D name) of bones that fix the skull and the right hand.
HEAD_PAIRS = [("Frontal bone", "frontal bone"), ("Occipital bone", "occipital bone"), ("Mandible", "mandible"), ("Sphenoid bone", "sphenoid bone")] + [
    (f"{bone[0].upper()}{bone[1:]}.{suffix}", f"{word} {bone}") for bone in ("parietal bone", "temporal bone", "zygomatic bone", "maxilla", "nasal bone")
    for word, suffix in (("left", "l"), ("right", "r"))]
HAND_DIGITS = dict(thumb="first", index="second", middle="third", ring="fourth", little="fifth")
HAND_PAIRS = [(f"{n[0].upper()}{n[1:]} metacarpal bone.r", f"right {n} metacarpal bone") for n in HAND_DIGITS.values()] + [
    (f"{position} phalanx of {HAND_DIGITS[name.split()[-2] if name.endswith('finger') else 'thumb']} finger of hand.r", name)
    for _, _, name in FINGERS[1:] for position in [name.split()[0].capitalize()]] + [
    (f"{z} bone.r", f"right {name}") for z, name in [("Capitate", "capitate"), ("Hamate", "hamate"), ("Scaphoid", "scaphoid"), ("Lunate", "lunate"),
                                                      ("Trapezium", "trapezium"), ("Triquetrum", "triquetral"), ("Pisiform", "pisiform")]]
HAND_PARENTS = ["hand_palm"] + [f"hand_b_{a}_{b}" for a, b, _ in FINGERS]
SEGMENTS = [  # mesh key, label, frame, landmark base indices
    ("trunk", "Trunk nerves", "torso", None), ("brachial", "Brachial plexus", "torso", None), ("upperarm", "Arm nerves", "bone", (11, 13)),
    ("forearm", "Forearm nerves", "bone", (13, 15)), ("lumbosacral", "Lumbosacral plexus", "torso", None),
    ("thigh", "Thigh nerves", "bone", (23, 25)), ("shin", "Leg nerves", "bone", (25, 27)), ("foot", "Foot nerves", "foot", (27, 29, 31)),
]
SIDES = 5          # tube cross-section
SPAN_SAMPLES = 12  # per Bezier span before simplification (the source's own preview resolution)
TOLERANCE_CM = 0.04


def fetch_archive() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    if not ARCHIVE.exists():
        temporary = ARCHIVE.with_suffix(".zip.partial")
        subprocess.run(["curl", "--fail", "--location", "--retry", "2", "--silent", "--show-error", "--output", str(temporary), ARCHIVE_URL], check=True)
        temporary.rename(ARCHIVE)
    if sha(ARCHIVE.read_bytes()) != ARCHIVE_SHA256: raise SystemExit("Z-Anatomy archive checksum mismatch")


def wanted_names() -> list:
    return sorted(CHAIN) + sorted(name for group in REGISTRATION.values() for name in group) + sorted(z for z, _ in HEAD_PAIRS + HAND_PAIRS)


def extract_curves() -> dict:
    """Read nerve curves and reference bone boxes from the .blend (world space, metres)."""
    if CURVES.exists():
        cached = json.loads(CURVES.read_text())
        # The cache holds only the objects asked for; a longer nerve or bone list needs the file read again.
        if cached.get("blendSha256") == BLEND_SHA256 and cached.get("wanted") == wanted_names(): return cached
    from blender_asset_tracer import blendfile
    blend = CACHE / f"Z-Anatomy-{COMMIT[:8]}.blend"
    if not blend.exists():
        with zipfile.ZipFile(ARCHIVE) as archive: blend.write_bytes(archive.read(BLEND_MEMBER))
    if sha(blend.read_bytes()) != BLEND_SHA256: raise SystemExit("Z-Anatomy blend checksum mismatch")
    bf = blendfile.open_cached(blend)
    pointer = bf.header.pointer_size
    triple, radius_offset = bf.struct(b"BezTriple"), bf.struct(b"BezTriple").field_from_path(pointer, b"radius")[1]

    def world(ob):
        fields = [f.name.name_only for f in ob.dna_type.fields]
        m = list(ob[b"object_to_world"] if b"object_to_world" in fields else ob[b"obmat"])
        if isinstance(m[0], (list, tuple)): m = [v for row in m for v in row]
        return np.asarray(m, dtype=np.float64).reshape(4, 4).T  # stored column-major

    wanted = {f"{name}.{s}" for name in CHAIN for s in "lr"} | set(CHAIN)
    bones = {f"{name[0].upper()}{name[1:]}.{s}" for group in REGISTRATION.values() for name in group for s in "lr"} | {z for z, _ in HEAD_PAIRS + HAND_PAIRS}
    curves, boxes = {}, {}
    for ob in bf.find_blocks_from_code(b"OB"):
        name = ob[b"id", b"name"].decode("utf8")[2:]
        if ob[b"type"] == 1 and name in bones:
            mesh, m = ob.get_pointer(b"data"), world(ob)
            # A rotated object's local box is not its world box; such bones cannot serve as a reference.
            if not np.allclose(m[:3, :3], np.diag(np.diag(m[:3, :3])), atol=1e-6): continue
            loc, size = np.asarray(mesh[b"loc"]), np.asarray(mesh[b"size"])
            corners = np.array([m[:3, :3] @ (loc + size * sign) + m[:3, 3] for sign in (-1, 1)])
            boxes[name] = dict(min=corners.min(0).tolist(), max=corners.max(0).tolist())
        if ob[b"type"] != 2 or name not in wanted: continue
        curve, m, splines = ob.get_pointer(b"data"), world(ob), []
        nurb = curve.get_pointer((b"nurb", b"first"))
        while nurb is not None:
            points = nurb.get_pointer(b"bezt")
            if nurb[b"type"] & 7 != 1 or nurb[b"flagu"] & 1 or points is None: raise ValueError(f"Unsupported spline: {name}")
            bf.fileobj.seek(points.file_offset); data = bf.fileobj.read(points.size)
            spline = []
            for i in range(points.count):
                handles = np.asarray(struct.unpack_from("<9f", data, i * triple.size)).reshape(3, 3)
                moved = (m[:3, :3] @ handles.T).T + m[:3, 3]
                spline.append(dict(left=moved[0].tolist(), co=moved[1].tolist(), right=moved[2].tolist(),
                                   radius=struct.unpack_from("<f", data, i * triple.size + radius_offset)[0]))
            splines.append(spline); nurb = nurb.get_pointer(b"next")
        if name in curves: raise ValueError(f"Duplicate source object: {name}")
        curves[name] = dict(bevelMetres=curve[b"ext2"], splines=splines)
    result = dict(blendSha256=BLEND_SHA256, wanted=wanted_names(), curves=dict(sorted(curves.items())), bones=dict(sorted(boxes.items())))
    CURVES.write_text(json.dumps(result, sort_keys=True))
    return result


def to_atlas_axes(points_m):
    """Z-Anatomy (x left, y posterior, z up, metres) -> atlas axes (x left, y up, z anterior), still unregistered cm."""
    p = np.asarray(points_m, dtype=np.float64)
    return np.column_stack((p[:, 0], p[:, 2], -p[:, 1])) * 100


def fit_boxes(atlas, boxes, pairs):
    """One scale and one translation mapping Z-Anatomy bones onto the same BodyParts3D bones, by their bounding boxes."""
    source, target, labels = [], [], []
    for z_name, atlas_name in pairs:
        box = boxes.get(z_name)
        if box is None: continue
        corners = to_atlas_axes([box["min"], box["max"]])
        v = atlas.combine([atlas_name])[0]
        source += [corners.min(0), corners.max(0)]; target += [v.min(0), v.max(0)]; labels += [atlas_name] * 2
    used = sorted(set(labels))
    if len(used) < 4: raise ValueError(f"Too few unrotated reference bones: {used}")
    source, target = np.asarray(source), np.asarray(target)
    centre_s, centre_t = source.mean(0), target.mean(0)
    scale = float(((source - centre_s) * (target - centre_t)).sum() / ((source - centre_s) ** 2).sum())
    offset = centre_t - scale * centre_s
    residual = np.abs(scale * source + offset - target)
    report = dict(bones=used, scale=round(scale, 6), offsetCm=[round(float(v), 4) for v in offset],
                  meanAbsResidualCm=round(float(residual.mean()), 4), maxAbsResidualCm=round(float(residual.max()), 4),
                  maxAbsResidualByBoneCm={name: round(float(max(residual[i].max() for i, label in enumerate(labels) if label == name)), 3) for name in used})
    if os.environ.get("PN_DEBUG"): print(json.dumps(report))
    if not 0.9 < scale < 1.0 or residual.max() > 0.5 or residual.mean() > 0.12: raise ValueError(f"Registration outside tolerance: {report}")
    return scale, offset, report


def register(atlas, boxes, bones, side):
    """Fit one limb on one side.

    Z-Anatomy mirrors one half of the body while BodyParts3D keeps the specimen's asymmetry,
    so each limb is fitted on its own side instead of sharing one whole-body transform.
    """
    word, suffix = ("left", "l") if side == "L" else ("right", "r")
    return fit_boxes(atlas, boxes, [(f"{bone[0].upper()}{bone[1:]}.{suffix}", f"{word} {bone}") for bone in bones])


def to_hand(parent, v, frames):
    """Atlas cm -> the local units of one hand rig mesh."""
    if parent == "hand_palm": return to_palm(v)
    origin, axes, length = frames[parent]
    return (raw_mm(v) - origin) @ axes / length


def hand_clouds(atlas, frames):
    """Bone surfaces of the right hand per rig mesh, after checking each frame against the published mesh."""
    clouds = {"hand_palm": np.concatenate([atlas.combine([name])[0] for name in PALM])}
    for a, b, name in FINGERS:
        parent = f"hand_b_{a}_{b}"
        v = atlas.combine([name])[0]
        reference, _ = head_geometry(parent)
        local = to_hand(parent, v[::max(1, len(v) // 400)], frames)
        distance = np.sqrt(((local[:, None, :] - reference[None, :, :]) ** 2).sum(2).min(1))
        if np.quantile(distance, 0.95) > 0.07: raise ValueError(f"Hand rig frame does not reproduce {parent}")
        clouds[parent] = v
    return {key: value[::3] for key, value in clouds.items()}


def classify_hand(points, clouds):
    """Rig mesh of every sample: the nearest bone group, smoothed so a course does not flicker between neighbours."""
    keys = list(clouds)
    distance = np.column_stack([nearest(points, clouds[key]) for key in keys])
    out = np.array([keys[i] for i in distance.argmin(1)], dtype=object)
    smooth = out.copy()
    for i in range(len(out)):
        window = list(out[max(0, i - 2):i + 3])
        smooth[i] = max(sorted(set(window)), key=window.count)
    return smooth


def sample_spline(spline):
    points, radii = [np.asarray(spline[0]["co"])], [spline[0]["radius"]]
    for a, b in zip(spline, spline[1:]):
        p0, p1, p2, p3 = (np.asarray(v) for v in (a["co"], a["right"], b["left"], b["co"]))
        for i in range(1, SPAN_SAMPLES + 1):
            t = i / SPAN_SAMPLES; u = 1 - t
            points.append(u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3)
            radii.append(a["radius"] + (b["radius"] - a["radius"]) * t)
    return np.asarray(points), np.asarray(radii)


def simplify(points, radii):
    """Douglas-Peucker on position, with the radius riding along as a fourth coordinate."""
    data = np.column_stack((points, radii))
    keep = np.zeros(len(data), dtype=bool); keep[[0, -1]] = True
    stack = [(0, len(data) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2: continue
        chord = data[b] - data[a]; length = chord @ chord
        rel = data[a + 1:b] - data[a]
        distance = np.linalg.norm(rel - np.outer((rel @ chord) / length, chord), axis=1) if length > 1e-12 else np.linalg.norm(rel, axis=1)
        i = int(distance.argmax())
        if distance[i] > TOLERANCE_CM: keep[a + 1 + i] = True; stack += [(a, a + 1 + i), (a + 1 + i, b)]
    return points[keep], radii[keep]


def nearest(points, cloud):
    out = np.empty(len(points))
    for start in range(0, len(points), 256):
        chunk = points[start:start + 256]
        out[start:start + 256] = np.sqrt(((chunk[:, None, :] - cloud[None, :, :]) ** 2).sum(2).min(1))
    return out


def classify(points, chain, side, frames, clouds):
    """Segment of every sample. Limb versus trunk goes by the nearer skeleton; joints by the tracking frames."""
    if chain in ("brachial", "lumbosacral", "trunk", "head"): return np.array([chain] * len(points), dtype=object)
    limb = nearest(points, clouds[f"{chain}_{side}"]) < nearest(points, clouds["torso"])
    local = lambda key: np.linalg.solve(frames[f"{key}_{side}"][1], (points - frames[f"{key}_{side}"][0]).T).T[:, 0]
    if chain == "arm":
        t = local("forearm")
        out = np.where(~limb, "brachial", np.where(t > 1, "hand", np.where(t >= 0, "forearm", "upperarm")))
    else:
        t = local("shin")
        out = np.where(~limb, "lumbosacral", np.where(t > 1, "foot", np.where(t >= 0, "shin", "thigh")))
    out = out.astype(object)
    # A course close to two skeletons can flip for a sample or two; take the majority over ~2 cm.
    smooth = out.copy()
    for i in range(len(out)):
        window = list(out[max(0, i - 3):i + 4])
        smooth[i] = max(sorted(set(window)), key=window.count)
    return smooth


def tube(points, radii):
    """Closed tube around a polyline: parallel-transported rings plus one cap vertex at each end."""
    tangents = np.gradient(points, axis=0)
    tangents /= np.linalg.norm(tangents, axis=1, keepdims=True)
    reference = np.array([0.0, 0.0, 1.0]) if abs(tangents[0][2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    normal = np.cross(tangents[0], reference); normal /= np.linalg.norm(normal)
    vertices, faces = [], []
    for i, (p, t, r) in enumerate(zip(points, tangents, radii)):
        normal = normal - t * (normal @ t); normal /= np.linalg.norm(normal)
        binormal = np.cross(t, normal)
        for k in range(SIDES):
            angle = 2 * np.pi * k / SIDES
            vertices.append(p + r * (np.cos(angle) * normal + np.sin(angle) * binormal))
        if i:
            a, b = (i - 1) * SIDES, i * SIDES
            for k in range(SIDES):
                n = (k + 1) % SIDES
                faces += [[a + k, b + k, b + n], [a + k, b + n, a + n]]
    start, end, last = len(vertices), len(vertices) + 1, (len(points) - 1) * SIDES
    vertices += [points[0], points[-1]]
    for k in range(SIDES):
        n = (k + 1) % SIDES
        faces += [[start, n, k], [end, last + k, last + n]]
    return np.asarray(vertices), np.asarray(faces, dtype=np.int64)


def pieces(labels):
    """Runs of equal label; neighbours share their boundary sample so the reference pose stays continuous."""
    start = 0
    for i in range(1, len(labels) + 1):
        if i == len(labels) or labels[i] != labels[start]:
            yield labels[start], slice(max(0, start - 1) if start else 0, i)
            start = i


def build():
    atlas = Atlas()
    points, torso_points, methods, height, floor, ceiling = reference_points(atlas)
    origin, torso = torso_basis(torso_points)
    companion = json.loads((OUT / "body.json").read_text())
    for key, expected in [("referencePoseCm", points), ("torsoReferencePoseCm", torso_points)]:
        if companion[key] != {str(k): v.tolist() for k, v in expected.items()}: raise ValueError(f"Companion reference changed: {key}")
    pose = demo_pose(torso_points, floor, ceiling)
    if pose != companion["demoPose"]: raise ValueError("Demo pose differs from existing atlas")
    source = extract_curves()
    fits = {(limb, side): register(atlas, source["bones"], bones, side) for limb, bones in REGISTRATION.items() for side in "LR"}
    registration = dict(method="least-squares uniform scale and translation between bounding boxes of matched bones, fitted per limb and side; "
                               "the skull is fitted once for both sides and the hand on the right side only",
                        fits={f"{limb}_{side}": fit[2] for (limb, side), fit in sorted(fits.items())})
    fits["head", "L"] = fits["head", "R"] = fit_boxes(atlas, source["bones"], HEAD_PAIRS)
    fits["hand", "R"] = fit_boxes(atlas, source["bones"], HAND_PAIRS)
    registration["fits"].update(head=fits["head", "L"][2], hand_R=fits["hand", "R"][2])

    by_name = {m["name"]: m["sourceElements"] for m in companion["meshes"]}
    cloud = lambda names: np.concatenate([atlas.load_element(e)[0] for n in names for e in by_name[n]])[::7]
    clouds = dict(torso=cloud(["torso_skel", "cervical_skel"]))
    frames, specs = {}, {}
    for side, delta in (("L", 0), ("R", 1)):
        clouds[f"arm_{side}"] = cloud([f"arm_humerus_{side}", f"arm_forearm_{side}"])
        clouds[f"leg_{side}"] = cloud([f"leg_femur_{side}", f"leg_shin_{side}", f"foot_{side}"])
        for key, label, frame, landmarks in SEGMENTS:
            spec = dict(name=f"pn_{key}_{side}", side=side, frame=frame, label=f"{label} {side}", key=key)
            if landmarks: spec["landmarks"] = [i + delta for i in landmarks]
            specs[f"{key}_{side}"] = spec
            frames[f"{key}_{side}"] = source_frame(spec, points, origin, torso)
        # head cm = atlas cm @ R * s + t (build_nerves.py), written as origin + basis @ local like the other frames.
        rotation, shift = to_head(np.eye(3)) - to_head(np.zeros((1, 3))), to_head(np.zeros((1, 3)))[0]
        specs[f"head_{side}"] = dict(name=f"pn_head_{side}", side=side, frame="head", label=f"Cranial nerves {side}", key="head")
        frames[f"head_{side}"] = (-np.linalg.solve(rotation.T, shift), np.linalg.inv(rotation.T))
    # Hand rig meshes: local = (raw mm - origin) @ axes / length, with raw mm = atlas cm @ to_raw.
    to_raw = raw_mm(np.eye(3))
    rig = hand_frames()
    palm_points, palm_basis = hand_frame()
    for parent in HAND_PARENTS:
        specs[parent] = dict(name=f"pn_{parent}", side="R", frame="hand", handParent=parent, key="hand")
        rig_origin, rig_basis = (palm_points[0], palm_basis) if parent == "hand_palm" else (rig[parent][0], rig[parent][1] * rig[parent][2])
        frames[parent] = (rig_origin @ np.linalg.inv(to_raw), np.linalg.inv(to_raw).T @ rig_basis)
    hand_bones = hand_clouds(atlas, rig)
    probe = np.concatenate(list(hand_bones.values()))[::97]
    for key, direct in [("head_L", to_head(probe))] + [(parent, to_hand(parent, probe, rig)) for parent in HAND_PARENTS]:
        if not np.allclose(np.linalg.solve(frames[key][1], (probe - frames[key][0]).T).T, direct, atol=1e-6): raise ValueError(f"Frame {key} disagrees with its transform")

    collected = {key: [] for key in specs}  # mesh key -> [(object name, base name, points, radii)]
    used, dropped = [], {}
    for name, curve in source["curves"].items():
        base, suffix = (name[:-2], name[-1]) if name[-2:] in (".l", ".r") else (name, None)
        if base not in CHAIN: continue  # the curve cache may hold objects that were since excluded
        chain = CHAIN[base]
        for index, spline in enumerate(curve["splines"]):
            raw_points, relative = sample_spline(spline)
            unregistered = to_atlas_axes(raw_points)
            # One source object carries no side suffix; its side is read from where it lies.
            side = {"l": "L", "r": "R"}.get(suffix) or ("L" if unregistered[:, 0].mean() > 0 else "R")
            if (unregistered[:, 0].mean() > 0) != (side == "L"): raise ValueError(f"Source side contradicts geometry: {name}")
            if chain == "hand" and side != "R": break  # the left hand is the mirrored right hand
            scale, offset, _ = fits[LIMB.get(chain, chain), side]
            p = scale * unregistered + offset
            radii = np.clip(relative * curve["bevelMetres"] * 100 * scale * 2.0, 0.12, 0.55)
            labels = classify_hand(p, hand_bones) if chain == "hand" else classify(p, chain, side, frames, clouds)
            # A right forearm nerve that continues past the wrist goes on into the hand rig.
            beyond = labels == "hand"
            if side == "R" and beyond.sum() > 1: labels[beyond] = classify_hand(p[beyond], hand_bones)
            for label, part in pieces(labels):
                pp, rr = simplify(p[part], radii[part])
                length = float(np.linalg.norm(np.diff(pp, axis=0), axis=1).sum())
                in_hand = label in specs
                if label == "hand" or length < (0.3 if in_hand else 0.6):
                    if length >= 0.05: dropped[f"{name}:{label}"] = round(dropped.get(f"{name}:{label}", 0) + length, 2)
                    continue
                collected[label if in_hand else f"{label}_{side}"].append((name, base, side, pp, rr))
        else: used.append(name)

    binary, meshes, labels_out, views = bytearray(), [], [], []
    for key, spec in specs.items():
        items = collected[key]
        if not items and spec["frame"] == "hand": continue  # not every finger bone has a nerve drawn beside it
        if not items: raise ValueError(f"No nerve reaches segment {key}")
        vv, ff, parts, count, index_at = [], [], [], 0, 0
        for name in sorted({item[0] for item in items}):
            base = next(item[1] for item in items if item[0] == name)
            first = index_at
            for _, _, _, pp, rr in [item for item in items if item[0] == name]:
                v, f = tube(pp, rr)
                vv.append(v); ff.append(f + count); count += len(v); index_at += f.size
            word = "left" if spec["side"] == "L" else "right"
            parts.append(dict(id=f"Z-Anatomy:{name}", name=f"{word} {base[0].lower()}{base[1:]}", side=spec["side"], kind="nerve",
                              identityScope="nerve-course", sourceObject=name, start=first, count=index_at - first))
            # Shown on a left hand, the same course carries the identity of the left-hand source object.
            if spec["frame"] == "hand":
                parts[-1].update(sourceSide="R", mirroredForLeft=True, pairedId=f"Z-Anatomy:{name[:-1]}l", pairedName=f"left {base[0].lower()}{base[1:]}")
        v, f = np.concatenate(vv), np.concatenate(ff)
        if len(v) > 65535: raise ValueError(f"Nerve mesh exceeds 16-bit indices: {key}")
        frame_origin, basis = frames[key]
        local = np.linalg.solve(basis, (v - frame_origin).T).T
        minimum, size = local.min(0), local.max(0) - local.min(0)
        if not np.isfinite(local).all() or np.any(size <= 0): raise ValueError("Invalid nerve geometry")
        q = np.rint((local - minimum) / size * 65535).clip(0, 65535).astype("<u2")
        off_v = len(binary); binary += q.tobytes()
        off_i = len(binary); binary += np.asarray(f, dtype="<u2").tobytes()
        entry = {k: spec[k] for k in ["name", "side", "frame", "landmarks", "handParent"] if k in spec}
        entry.update(layer="peripheralNerves", region=spec["key"], nv=len(v), ni=int(f.size), min=minimum.tolist(), size=size.tolist(),
                     offV=off_v, offI=off_i, parts=parts, sourceFrame=dict(originCm=frame_origin.tolist(), basisColumnsCm=basis.T.tolist()))
        if spec["frame"] == "bone":
            entry["jointAnchors"] = [[0, 0, 0], [1, 0, 0]]
            entry["jointAnchorMethod"] = "companion skeletal reference joints; not nerve landmarks"
        longest = max(items, key=lambda item: np.linalg.norm(np.diff(item[3], axis=0), axis=1).sum())
        anchor = np.linalg.solve(basis, longest[3][len(longest[3]) // 2] - frame_origin)
        if "label" in spec: labels_out.append(dict(t=spec["label"], layer="peripheralNerves", mesh=spec["name"], pts=[anchor.tolist()]))
        meshes.append(entry); views.append((spec, items))
        print(f"{spec['name']}: {len(parts)} nerves, {len(items)} courses, {len(v)} vertices, {len(f)} triangles", flush=True)

    meta = dict(schemaVersion=1, format="quantized-uint16-le", layer="peripheralNerves", meshes=meshes, labels=labels_out,
                binaryBytes=len(binary), binarySha256=sha(binary), companionBodyBinarySha256=companion["binarySha256"],
                attribution=ATTRIBUTION, license="CC-BY-SA-4.0", licenseUrl="https://creativecommons.org/licenses/by-sa/4.0/",
                source=dict(dataset="Z-Anatomy", repository="https://github.com/Z-Anatomy/Models-of-human-anatomy", commit=COMMIT,
                            downloads=[dict(url=ARCHIVE_URL, sha256=ARCHIVE_SHA256)], member=BLEND_MEMBER, memberSha256=BLEND_SHA256,
                            sourceUnit="m", outputUnit="cm", representation="Bezier curves with a relative radius; not surfaces",
                            objectCount=len(used), objects=used, registration=registration,
                            tube=dict(sides=SIDES, simplifyToleranceCm=TOLERANCE_CM, radiusCm="source radius x bevel x 2, limited to 0.12-0.55")),
                referencePoseCm=companion["referencePoseCm"], torsoReferencePoseCm=companion["torsoReferencePoseCm"],
                referenceMethods=methods, measuredSourceHeightCm=height, demoPose=pose, demoAspect=companion["demoAspect"],
                coverage=dict(regions=[s[0] for s in SEGMENTS] + ["head", "hand"], nerveNames=sorted(CHAIN), sourceObjects=len(used),
                              droppedCoursesCm=dict(sorted(dropped.items())), excluded=EXCLUDED),
                limitations=LIMITATIONS)
    metadata = json.dumps(meta, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n"
    if len(binary) + len(metadata) > 1_400_000: raise ValueError("Peripheral nerve bundle exceeds 1.4 MB budget")
    return bytes(binary), metadata, views, atlas, by_name


def previews(views, atlas, by_name):
    os.environ.setdefault("MPLCONFIGDIR", str(CACHE / "matplotlib"))
    os.environ.setdefault("XDG_CACHE_HOME", str(CACHE))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    bones = np.concatenate([atlas.load_element(e)[0] for n in by_name if n.split("_")[0] in ("torso", "cervical", "arm", "leg", "foot") for e in by_name[n]])[::3]
    palette = plt.get_cmap("tab20")
    windows = dict(body=None, head=((-10, 10), (146, 168)), hand_R=((-36, -20), (66, 90)), chest=((-20, 20), (95, 148)), shoulder_L=((2, 30), (118, 152)), elbow_L=((12, 34), (88, 118)), forearm_L=((14, 36), (66, 100)),
                   pelvis=((-22, 22), (72, 112)), knee_L=((0, 20), (30, 60)), leg_L=((0, 20), (2, 48)))
    for view, axes in (("front", (0, 1)), ("back", (0, 1)), ("side", (2, 1))):
        for window, limits in windows.items():
            if view == "side" and window not in ("body", "head") and not window.endswith("_L"): continue
            fig, ax = plt.subplots(figsize=(8, 12) if window == "body" else (9, 9), dpi=120, facecolor="#101522")
            ax.scatter(bones[:, axes[0]], bones[:, axes[1]], s=0.6, c="#7f8ca8", alpha=0.35, linewidths=0, rasterized=True)
            names = sorted({item[1] for _, items in views for item in items})
            for spec, items in views:
                if view == "side" and spec["side"] != "L": continue
                for _, base, _, pp, rr in items:
                    ax.plot(pp[:, axes[0]], pp[:, axes[1]], color=palette(names.index(base) % 20), linewidth=max(0.8, rr.mean() * 6), solid_capstyle="round")
                    if limits and view != "side":
                        mid = pp[len(pp) // 2]
                        if limits[0][0] <= mid[0] <= limits[0][1] and limits[1][0] <= mid[1] <= limits[1][1]:
                            ax.annotate(base.replace(" nerve", "").replace(" of brachial plexus", ""), mid[[axes[0], axes[1]]], color="white", fontsize=6)
            ax.set_aspect("equal"); ax.set_facecolor("#101522"); ax.tick_params(colors="white", labelsize=7)
            if limits and view != "side": ax.set_xlim(*limits[0]); ax.set_ylim(*limits[1])
            elif limits: ax.set_ylim(*limits[1])
            if view == "back": ax.invert_xaxis()
            ax.set_title(f"Peripheral nerves / {window} / {view} / atlas cm", color="white", fontsize=10)
            fig.savefig(PREVIEWS / f"preview_peripheral_{window}_{view}.png", bbox_inches="tight"); plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--no-previews", action="store_true")
    args = parser.parse_args()
    verify_registration()
    immutable = {name: sha((OUT / name).read_bytes()) for name in ["head.bin", "head.json", "body.bin", "body.json", "muscles.bin", "muscles.json", "joints.bin", "joints.json", "nerves.bin", "nerves.json"]}
    fetch_sources(); fetch_archive()
    binary, metadata, views, atlas, by_name = build()
    for name, data in [("peripheral.bin", binary), ("peripheral.json", metadata)]:
        path = OUT / name
        if args.verify:
            if path.read_bytes() != data: raise SystemExit(f"Deterministic peripheral nerve rebuild differs: {name}")
        else: path.write_bytes(data)
    if not args.no_previews: previews(views, atlas, by_name)
    for name, digest in immutable.items():
        if sha((OUT / name).read_bytes()) != digest: raise SystemExit(f"Existing anatomy artifact changed: {name}")
    print(f"{'Verified byte-identical' if args.verify else 'Built'} peripheral nerves: {len(binary):,} binary bytes; {len(binary) + len(metadata):,} combined bytes; SHA256 {sha(binary)}")


if __name__ == "__main__": main()
