# Anatomy model options

Reviewed 2026-11-12 for the body-muscle addition. This is an implementation assessment, not a comparative anatomical-accuracy validation.

## Current choice: BodyParts3D 3.0

The pinned conventional OBJ archive and naming tables are already available locally. Bone, organ and muscle geometry share the same source coordinate frame. Reusing this release allows a separate lazy-loaded muscle atlas without changing the existing head/body binaries. The downloaded catalogue contains 1,523 named concepts and 934 OBJ entries; concepts may represent composite structures, so these are not counts of distinct muscles or organs.

Primary sources:

- [Official archive description](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html)
- [3.0 archive README](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html)
- [Official version and modelling notes](https://lifesciencedb.jp/bp3d/info_en/index.html)

The official notes explicitly describe incomplete coverage and possible modelling errors. Major geometry versions may use different coordinates. Neither newer version numbers nor higher polygon counts establish better accuracy for this overlay.

## Candidates for later comparison

### Z-Anatomy

[Official repository](https://github.com/Z-Anatomy/Models-of-human-anatomy) supplies a navigable Blender template derived from BodyParts3D. It is a useful candidate for named structures, editing and export. Its overall README states CC BY-SA 4.0, but also lists third-party inner-ear and kidney material with noncommercial terms. Inspect the actual selected meshes and their provenance rather than assuming the project-level statement covers every component.

No Z-Anatomy geometry has been imported into this release. Visual superiority, coordinate compatibility, available rigging and browser performance have not been measured here.

### Open 3D Anatomy / AnatomyTOOL

The [project modeller's account](https://www.eungyeol-lee.com/open3dman) describes collaboration with university anatomists, remodeling of predecessor BodyParts3D/Z-Anatomy surfaces, and additional anatomical structures. This makes it a candidate for a focused comparison of shoulder, pelvis or other regions.

The [project site](https://anatomytool.org/open3dmodel-about) and download pages timed out during this review. Current downloadable coverage, geometry and texture terms, coordinates, and runtime cost remain unverified. The modeller's description is evidence of their workflow, not an independent accuracy ranking.

## Appropriate use of an LLM

An LLM can write import/export, mesh grouping, simplification, registration, material, rigging and QA scripts. Reference geometry and documented source IDs remain the basis for anatomy. A plausible generated mesh alone does not establish valid origin/insertion points, muscle layering, or anatomical accuracy.

For a later deformation prototype, choose one joint and preserve the reference mesh. Establish origin/insertion anchors from an anatomical source, validate registration and bone assignments, then apply normalized multi-bone weights with inverse rest transforms. Check rest-pose reconstruction, motion continuity, attachments, self-intersection and bone penetration over defined poses. Distance-only weights do not establish anatomical attachment. Volume, wrapping paths and physiological contraction need additional modelling; do not label ordinary skinning as a physiological simulation.

Any candidate must pass source/licence tracing, source-frame alignment, bilateral ordering, valid geometry/index bounds, rest-pose and articulated visual review, original-layer regression checks, independent lazy loading, and browser frame-time measurements on the target devices. Numerical anatomical thresholds require a justified reference; illustrative numbers from an LLM are not acceptance criteria.

## Independent Fable review

Fable was actually invoked in a tool-free, nonpersistent review session with the project constraints supplied in its prompt. The local CLI alias initially resolved to `claude-fable-5-1`. An explicit 5.2 request required a newer CLI; a temporary installation of `@anthropic-ai/claude-code@2.1.290` then successfully returned model usage for `claude-fable-5-2`, without changing the global CLI installation.

Fable 5.2 recommended processing reference geometry rather than asserting a better anatomy model generated from scratch. Its main concerns were unobservable scapular/spinal motion and axial rotation, skinning artifacts around joints, and differences between the reference body proportions and the viewer. Its multi-anchor sketch correctly included the inverse rest transform. These are design-review findings, not evidence that Fable inspected the source meshes or that physiological deformation has been implemented. The present release implements regional rigid tracking only.

## Implemented additional source after the scope expanded

The user selected skeletal/joint, muscle and nervous/sensory systems. Inspection found that the BodyParts3D 3.0 spinal-cord alias resolves only a short central-canal surface, not a complete spinal cord; the inspected 4.0 alias has the same problem. The new neural atlas therefore uses the actual [HRA male spinal cord v1.0](https://doi.org/10.48539/HBM366.MTJD.685), CC BY 4.0, preserving its 30 original segment surfaces and fitting them to measured BodyParts3D canal references. The original mesh topology is preserved. Five BodyParts3D optic structures are separately registered to the existing canonical head geometry. Detailed registration, source counts, numerical checks and limits are in `NOTES.nerve-assets.md`. This is the additional source actually integrated; Z-Anatomy and Open3DAnatomy remain comparison candidates.
