# Z-Anatomy peripheral nerves

Z-Anatomy, the libre 3D atlas of anatomy. Gauthier Kervyn (design, 3D, anatomy) and contributors. <https://github.com/Z-Anatomy/Models-of-human-anatomy>

Source license: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). Z-Anatomy is itself derived from BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan.

- Pinned repository commit: `bb293be456f6d2245191f37752d14ec76894740d`
- Archive `Z-Anatomy.zip` SHA-256: `e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736`
- Member `Z-Anatomy/Startup.blend` SHA-256: `9f08a17ea0115fed80b2a73ecdf0a1bc2ab2f6956f37c593ce23d513ea35afcd`

Only named nerve curve objects were used: those of the limbs, the brachial plexus and the lumbosacral plexus, the intercostal nerves, cranial nerves with the branches of the trigeminal nerve, and the nerves of the right hand. The Z-Anatomy file also lists third-party reference models under other terms (including non-commercial ones for the inner ear and a kidney); none of those were used.

Changes made for Anatomy Mirror: the Bezier curves were sampled, registered to this project's BodyParts3D skeleton with one uniform scale and translation per limb fitted to matched bones, cut at the joints into rigid tracking segments, swept into tubes whose thickness is exaggerated for visibility, and quantized. Cranial nerves were registered to the skull and placed in the head model with the transform already used for the optic pathway; hand nerves were registered to the right hand, cut by finger bone, and are shown mirrored on the left hand. One source object whose curve contradicts its name is not published. Exact parameters, residuals and limitations are recorded in `public/anatomy/peripheral.json` and `NOTES.peripheral-nerves.md`.

The adapted files `peripheral.bin` and `peripheral.json` are offered under CC BY-SA 4.0. They show illustrated atlas courses, not a scan of the viewer and not segmented imaging, and have not been clinically validated. The upstream authors do not endorse this application or its changes.
