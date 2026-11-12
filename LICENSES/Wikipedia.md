# Wikipedia reference text

The origin, insertion, action, nerve supply and blood supply shown for a picked muscle, the source, branches and territory shown for a picked nerve, and the articulations shown for a picked bone are quoted from the infobox of the matching English Wikipedia article. A bone also shows the opening paragraph of its article. Text by Wikipedia contributors. <https://en.wikipedia.org/>

Source license: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).

- Every entry in `public/anatomy/structure-info.json` names its article and the exact revision (`rev`). The card in the app links to that revision, where the article's authors are listed under "View history".
- `tools/structure-info/sources.json` records which article describes which structure in this project, which structures have no usable article, and every repair or omission.

Changes made for Anatomy Mirror: wiki markup, links and citations were removed and list items were put on separate lines. Opening paragraphs are cut at the end of a sentence, at about 420 characters, and pronunciations are left out of them. One article's stray characters were removed and three fields that an infobox used for something else were left out; both are listed in the sources file. Nothing was translated, reworded or added. A division of a muscle (a head or part) shows the text of its whole muscle; a few named branches show the text of their parent nerve; several back and foot muscles share the article of their group, as do numbered vertebrae, ribs, phalanges and the cuneiform bones. The card always names the article the text comes from.

The adapted file `structure-info.json` is offered under CC BY-SA 4.0. It is encyclopaedia text for anatomy teaching, has not been clinically validated, and Wikipedia's contributors do not endorse this application.
