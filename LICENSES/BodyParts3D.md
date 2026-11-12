# BodyParts3D anatomical data

BodyParts3D, © The Database Center for Life Science, licensed under Creative Commons Attribution-Share Alike 2.1 Japan.

All head, hand and body meshes are independently derived from the official
BodyParts3D **3.0 conventional OBJ release** dated 2011-09-15 and preserve the
explicit CC BY-SA 2.1 Japan grant in those source files. Head surfaces are
registered to MediaPipe canonical-face centimetres; the palm and fingers use
reference frames derived directly from the source bones. The derivatives in
`public/anatomy/` retain their per-source data licenses. Reproducible construction
and registration metrics are recorded in `NOTES.rebuild.md`. No endorsement by
DBCLS is implied.

構想受 Hashem Al-Ghaili 的 X-Ray Mirror 啟發，本專案的程式與資料為獨立製作
（[原貼文](https://x.com/HashemGhaili/status/2120202746121085321)）。

- License: https://creativecommons.org/licenses/by-sa/2.1/jp/
- Complete legal text: `BodyParts3D-CC-BY-SA-2.1-JP.html`
- Official source directory: https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/
- Original archive: https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_99.zip
- Archive SHA-256: `2125f6d761b14ead4ee64f71713f56f3f0f29982693ff20aac63474470cb92f4`

Modifications: exact-coordinate seam welding, quadric surface simplification, millimeter-to-centimeter conversion, a proper rotation from `[x,y,z]` to `[x,z,-y]`, normalization to torso/bone/foot reference frames, and 16-bit position quantization. Per-mesh FMA source concepts, source element identifiers, reference frames, budgets and source checksums are recorded in `public/anatomy/body.json`.

The current LSDB archive license page, updated 2025-02-27, additionally describes its database under CC BY 4.0: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html . This project conservatively retains the explicit historical share-alike grant attached to the selected 3.0 source files instead of silently changing their notice.

These meshes represent reference adult anatomy for education. They are not patient-specific anatomy or medical imaging.

The local legal-code HTML preserves the license text but removes the source website's executable scripts and stylesheet references.
