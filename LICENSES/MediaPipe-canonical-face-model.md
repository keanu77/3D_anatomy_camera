# MediaPipe canonical face model

The independent rebuild uses the official canonical face OBJ from
[google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe/blob/c85dfbc2506b65ebc9a76340dc1234513b18c215/mediapipe/modules/face_geometry/data/canonical_face_model.obj).

- Repository commit: `c85dfbc2506b65ebc9a76340dc1234513b18c215`.
- File: `mediapipe/modules/face_geometry/data/canonical_face_model.obj`.
- SHA-256: `8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618`.
- License: Apache-2.0, the [repository license at the pinned commit](https://github.com/google-ai-edge/mediapipe/blob/c85dfbc2506b65ebc9a76340dc1234513b18c215/LICENSE).
- The upstream OBJ remains unmodified in the ignored build cache. The builder
  verifies its digest on every load. It contains 468 vertices in centimetres.
- Intended use: registration target for BodyParts3D head surfaces and source of
  selected face landmark coordinates. It is not a patient-specific model.
- BodyParts3D-derived geometry retains its separate CC BY-SA 2.1 Japan license.

The complete Apache license is included in `MediaPipe-Apache-2.0.txt`.
