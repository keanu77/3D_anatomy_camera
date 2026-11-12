# Reference text for picked muscles, nerves and bones

Picking a muscle or nerve shows, under its name, what the infobox of its English Wikipedia article states: origin, insertion, action, nerve supply and blood supply for a muscle; where it arises, its branches and what it supplies for a nerve. A bone shows the opening paragraph of its article and, where the infobox states them, its articulations. The text is English and unedited. Teeth and joints show nothing.

## Where things are

- `tools/structure-info/sources.json` is the reviewed list: structure name to article title, `null` where no usable article exists, plus `repairs` and `omit`.
- `tools/build_structure_info.mjs` fetches the articles and writes `public/anatomy/structure-info.json`. It also writes `tools/out/structure-info-table.md`, every entry in one table, for review.
- `src/structure-info.js` looks a picked part up; `src/inspection-ui.js` draws it.

## Rebuilding

- `node tools/build_structure_info.mjs` rebuilds from the revisions pinned in the output file. `--verify` checks the committed file reproduces. Neither changes any text.
- `--refresh` takes the current revision of every article. Review the diff of `structure-info.json` afterwards: an article may have been vandalised or reworded.
- The builder stops on markup it cannot convert, on a shipped muscle or nerve that the sources file does not mention, and on a repair or omission that no longer applies.

## Decisions

- Source is the Wikipedia infobox, not Wikidata: Wikidata had all four muscle fields for 77 of 147 muscles and listed the axillary nerve for triceps. Text from a commercial atlas app cannot be reused.
- A head or part of a muscle shows its whole muscle. Iliocostalis, longissimus, spinalis, the scalenes and the foot lumbricals and interossei only have a group article, so their members share it. The card names the article, so this is visible.
- The two divisions of the mandibular nerve show the mandibular nerve.
- Named sub-branches without an article (muscular branches of the median, axillary and deep fibular nerves, the two branches of the medial antebrachial cutaneous nerve, dorsal digital branches) show their parent nerve.
- No text: the gemelli and the semispinalis muscles (the group infobox is wrong or nearly empty), opponens digiti minimi of the foot, and the roots, middle and inferior trunks and divisions of the brachial plexus.
- The text is downloaded on the first selection, about 15 KB compressed.

## Bones

- The bone infobox is thin: 46 of 115 bone names have Articulations, and humerus, scapula, radius, ulna and hip bone have none. So every bone also gets the opening paragraph of its article, cut at a sentence end near 420 characters, with pronunciations removed.
- The infobox's Origins and Insertions (attached muscles) are not used: nine articles fill them, and some misuse them (lumbar vertebrae list psoas major as an insertion).
- Numbered vertebrae, ribs, phalanges and the cuneiforms share a group article. Group articles are written about vertebrates in general; the cervical vertebrae paragraph mentions sauropsids and says little about the human neck.
- The builder stops on a template it does not know in an opening paragraph. Add the template to `expandProseTemplate` in `tools/structure-info/wikitext.mjs` after reading what it renders.

## Known weak entries, left as the source has them

Root values that describe the nerve, not the muscle's own segments (brachioradialis and anconeus list C5 to T1); latissimus dorsi origin "T7-S5"; obturator externus action "abduct thigh"; adductor minimus "obturator and tibial nerves". Correcting these means either editing Wikipedia and refreshing, or adding an overrides list that marks the text as changed.
