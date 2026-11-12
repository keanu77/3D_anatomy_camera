import { test, expect } from 'vitest';
import { infoboxParams, leadParagraph, plainText } from '../../tools/structure-info/wikitext.mjs';

const TRICEPS = `{{Short description|Muscle}}
{{Infobox muscle
| Name = Triceps
| Image = Triceps brachii.png
| Caption = Triceps {{small|(shown in [[red]])}}
| Origin = '''Long head:''' [[infraglenoid tubercle of scapula]] <br />'''Lateral head:''' above the [[radial groove]]<br>'''Medial head:''' below the [[radial groove]]
| Insertion = [[Olecranon]] process of [[ulna]]<ref name="a">{{cite book |title=Anatomy |page=1}}</ref>
| Blood = [[Deep brachial artery]], [[posterior circumflex humeral artery]] (long head only)
| Nerve = [[Radial nerve]]<ref name="a" />
| Action = [[Extension (kinesiology)|Extends]] [[forearm]]
| Antagonist =
}}
The '''triceps''' is a muscle. {{Infobox nerve| Innervates = wrong box }}`;

test('reads the parameters of the named infobox only', () => {
  const params = infoboxParams(TRICEPS, 'muscle');
  expect(params.get('insertion')).toContain('[[Olecranon]]');
  expect(params.get('antagonist')).toBe('');
  expect(params.get('caption')).toBe('Triceps {{small|(shown in [[red]])}}');
  expect(infoboxParams(TRICEPS, 'nerve').get('innervates')).toBe('wrong box');
  expect(infoboxParams('No box here', 'muscle')).toBeNull();
});

test('turns infobox markup into plain lines', () => {
  const params = infoboxParams(TRICEPS, 'muscle');
  expect(plainText(params.get('origin'))).toBe('Long head: infraglenoid tubercle of scapula\nLateral head: above the radial groove\nMedial head: below the radial groove');
  expect(plainText(params.get('insertion'))).toBe('Olecranon process of ulna');
  expect(plainText(params.get('nerve'))).toBe('Radial nerve');
  expect(plainText(params.get('action'))).toBe('Extends forearm');
});

test('keeps list items, subscripts and fractions readable', () => {
  expect(plainText('{{plainlist|\n* [[Tibia]]\n* [[Fibula|fibula]]\n}}')).toBe('Tibia\nfibula');
  expect(plainText('{{ubl|a|b}}')).toBe('a\nb');
  expect(plainText('C<sub>5</sub>&ndash;C<sub>6</sub>&nbsp;roots <!-- hidden -->')).toBe('C5–C6 roots');
  expect(plainText('lower {{frac|2|3}} of {{frac|1|1|2}}')).toBe('lower 2/3 of 1 1/2');
  expect(plainText('x{{citation needed|date=May 2020}}, [https://example.org the source]')).toBe('x, the source');
  expect(plainText('{{citation needed span|text=kept words|date=May 2020}}')).toBe('kept words');
  expect(plainText('femur and {{clarify|text=tibia fibula|date=May 2020}}{{clarify|date=May 2020}}')).toBe('femur and tibia fibula');
  expect(plainText("''Italic'' and <small>small</small>")).toBe('Italic and small');
  expect(plainText('Ribs 5-12,<br>iliac crest;')).toBe('Ribs 5-12\niliac crest');
});

test('refuses markup it does not know how to convert', () => {
  expect(() => plainText('{{convert|5|cm}}')).toThrow(/convert/);
  expect(() => plainText('<table><tr><td>x</td></tr></table>')).toThrow(/table/);
  expect(() => plainText('[[File:x.png|thumb|[[nested]] caption]]')).toThrow(/markup/);
});

const FEMUR = `{{Short description|Thigh bone}}
{{About|the bone|other uses|Femur (disambiguation)}}
{{Infobox bone
| Name = Femur
| Articulations = '''[[Hip]]:''' [[acetabulum]]<br/>'''[[knee]]:''' [[tibia]]
}}
[[File:Femur.png|thumb|The femur, with a [[nested]] link]]
The '''femur''' ({{IPAc-en|ˈ|f|iː|m|ər}}; {{plural form}}: '''femurs''' or '''femora''' {{IPAc-en|ˈ|f|ɛ|m|ər|ə}}),{{refn|{{cite Merriam-Webster|femora}}}} or '''thigh bone''' is the only [[long bone|bone]] in the [[thigh]].<ref>A source.</ref> In many [[quadrupeds|four-legged animals]], the femur is the upper bone of the [[hindleg]].

The top of the femur fits into the [[hip joint]].

==Structure==
Text.`;

test('takes the opening paragraph of an article as plain sentences', () => {
  expect(leadParagraph(FEMUR)).toBe('The femur (pl.: femurs or femora), or thigh bone is the only bone in the thigh. In many four-legged animals, the femur is the upper bone of the hindleg.');
  expect(leadParagraph("The '''vomer''' ({{IPAc-en|v|oʊ}}; {{langx|la|vomer|lit=ploughshare}}) is a bone {{convert|5|cm}} long{{snd}}roughly.")).toBe('The vomer (Latin: vomer) is a bone 5 cm long – roughly.');
  expect(leadParagraph("The '''navicular bone''' {{IPAc-en|n}} is small ({{IPAc-en|a}} or {{IPAc-en|b}}), with '''tibiae''' {{IPAc-en|t}}or more.")).toBe('The navicular bone is small, with tibiae or more.');
  expect(() => leadParagraph("The '''x''' ({{langx|xx|y}}) is.")).toThrow(/language code/);
  expect(leadParagraph("The '''phalanges''' ({{IPAc-en|f}}; {{singular abbr|'''phalanx'''}} {{IPAc-en|'|f}}) are bones.")).toBe('The phalanges (sg.: phalanx) are bones.');
});

test('keeps whole sentences up to the length limit, and a list that the paragraph introduces', () => {
  const long = "The '''rib''' is a bone. It is curved. It protects the lungs. It has a head.";
  expect(leadParagraph(long, { limit: 45 })).toBe('The rib is a bone. It is curved.');
  expect(leadParagraph(long, { limit: 5 })).toBe('The rib is a bone.');
  expect(leadParagraph("There are three '''cuneiform''' bones:\n* the [[medial cuneiform|medial]]\n* the lateral\n\nNext paragraph."))
    .toBe('There are three cuneiform bones:\nthe medial\nthe lateral');
  expect(leadParagraph("There are three '''cuneiform''' bones:\n\n* the medial\n* the lateral\n\nNext paragraph.")).toBe('There are three cuneiform bones:\nthe medial\nthe lateral');
});

test('an article without a readable opening, or with unknown markup in it, is an error', () => {
  expect(() => leadParagraph('{{Infobox bone}}\n==Structure==\n')).toThrow(/opening/);
  expect(() => leadParagraph("The '''x''' is {{mystery|1}}.")).toThrow(/mystery/);
});
