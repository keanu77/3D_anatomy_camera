import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

// Independent of the picking code: decode the published buffers and check that each
// labelled source range sits where anatomy says it must. A swapped identity or side
// in the build pipeline would pass the range tests but fail here.
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];

async function centroids(bundle) {
  const url = extension => new URL(`../../public/anatomy/${bundle}.${extension}`, import.meta.url);
  const meta = JSON.parse(await readFile(url('json'), 'utf8')), file = await readFile(url('bin'));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), result = new Map();
  for (const mesh of meta.meshes) {
    const quantized = new Uint16Array(buffer, mesh.offV, mesh.nv * 3), indices = new Uint16Array(buffer, mesh.offI, mesh.ni);
    result.set(mesh.name, { mesh, parts: mesh.parts.map(part => {
      const sum = [0, 0, 0], used = new Set(indices.subarray(part.start, part.start + part.count));
      for (const vertex of used) for (let axis = 0; axis < 3; axis++) sum[axis] += mesh.min[axis] + quantized[vertex * 3 + axis] / 65535 * mesh.size[axis];
      return { part, at: sum.map(value => value / used.size) };
    }) });
  }
  return result;
}
const strictlyDescending = values => values.every((value, i) => i === 0 || value < values[i - 1]);
const find = (group, name) => group.parts.find(entry => entry.part.name === name).at;

describe('published source ranges sit where their labels say', () => {
  test('left is +x and right is -x for every sided torso and head surface; unsided ones are midline', async () => {
    const body = await centroids('individual-body'), head = await centroids('individual-head');
    let sided = 0;
    for (const { mesh, parts } of [...body.values()].filter(group => group.mesh.frame === 'torso')) {
      for (const { part, at } of parts) {
        if (part.side === 'L') { expect(at[0], part.name).toBeGreaterThan(0.01); sided++; }
        else if (part.side === 'R') { expect(at[0], part.name).toBeLessThan(-0.01); sided++; }
        else expect(Math.abs(at[0]), `${mesh.name}:${part.name}`).toBeLessThan(0.02);
      }
    }
    for (const name of ['muscles', 'cranium', 'jaw']) {
      for (const { part, at } of head.get(name).parts) {
        if (part.side === 'L') { expect(at[0], part.name).toBeGreaterThan(0.1); sided++; }
        else if (part.side === 'R') { expect(at[0], part.name).toBeLessThan(-0.1); sided++; }
        else expect(Math.abs(at[0]), part.name).toBeLessThan(0.5);
      }
    }
    expect(sided).toBe(228);
  });

  test('numbered vertebrae, ribs and sternal parts run from head to pelvis in order', async () => {
    const body = await centroids('individual-body'), torso = body.get('torso_skel');
    const heights = (group, pattern) => group.parts.map(({ part, at }) => ({ match: part.name.match(pattern), y: at[1] }))
      .filter(entry => entry.match).sort((a, b) => ORDINALS.indexOf(a.match[1]) - ORDINALS.indexOf(b.match[1])).map(entry => entry.y);
    const cervical = heights(body.get('cervical_skel'), /^(\w+) cervical vertebra$/);
    const thoracic = heights(torso, /^(\w+) thoracic vertebra$/), lumbar = heights(torso, /^(\w+) lumbar vertebra$/);
    expect([cervical.length, thoracic.length, lumbar.length]).toEqual([5, 12, 5]);
    expect(strictlyDescending([...cervical, ...thoracic, ...lumbar, find(torso, 'sacrum')[1]])).toBe(true);
    for (const side of ['left', 'right']) {
      const ribs = heights(torso, new RegExp(`^${side} (\\w+) rib$`));
      expect(ribs).toHaveLength(12); expect(strictlyDescending(ribs), side).toBe(true);
    }
    expect(strictlyDescending(['manubrium', 'body of sternum', 'xiphoid process'].map(name => find(torso, name)[1]))).toBe(true);
  });

  test('teeth follow the dental arch: upper above lower, incisors outwards from the midline, canines to molars backwards', async () => {
    const head = await centroids('individual-head');
    const order = ['central secondary incisor', 'lateral secondary incisor', 'secondary canine', 'first secondary premolar', 'second secondary premolar', 'first secondary molar', 'second secondary molar'];
    for (const [jaw, group] of [['upper', head.get('cranium')], ['lower', head.get('jaw')]]) {
      for (const side of ['left', 'right']) {
        const arch = order.map(kind => find(group, `${side} ${jaw} ${kind} tooth`));
        // Incisors stand almost side by side, so depth only orders the arch from the canine back.
        expect(strictlyDescending(arch.slice(2).map(at => at[2])), `${side} ${jaw} front-to-back`).toBe(true);
        const fromMidline = arch.slice(0, 5).map(at => -Math.abs(at[0]));
        expect(strictlyDescending(fromMidline), `${side} ${jaw} midline-outwards`).toBe(true);
      }
    }
    const upper = find(head.get('cranium'), 'right upper first secondary molar tooth'), lower = find(head.get('jaw'), 'right lower first secondary molar tooth');
    expect(upper[1]).toBeGreaterThan(lower[1]);
  });

  test('paired limb bones keep their anatomical relationship in both limbs', async () => {
    const body = await centroids('individual-body');
    for (const [side, word] of [['L', 'left'], ['R', 'right']]) {
      const forearm = body.get(`arm_forearm_${side}`), shin = body.get(`leg_shin_${side}`), thigh = body.get(`leg_femur_${side}`);
      // The patella lies at the distal end of the femur frame and in front of it.
      expect(find(thigh, `${word} patella`)[0]).toBeGreaterThan(find(thigh, `${word} femur`)[0] + 0.3);
      expect(find(thigh, `${word} patella`)[1]).toBeGreaterThan(find(thigh, `${word} femur`)[1]);
      // Radius/ulna and tibia/fibula sit on opposite sides of the limb axis, mirrored between limbs.
      const sign = side === 'L' ? 1 : -1;
      expect(sign * (find(forearm, `${word} ulna`)[2] - find(forearm, `${word} radius`)[2]), 'radius/ulna').toBeGreaterThan(0.03);
      expect(sign * (find(shin, `${word} tibia`)[2] - find(shin, `${word} fibula`)[2]), 'tibia/fibula').toBeGreaterThan(0.05);
    }
  });
});
