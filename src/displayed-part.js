/** The part as named for the hand it is shown on. Kept apart from picking so that naming a part needs no renderer. */
export function displayedPart(part, side) {
  if (!side || !part.sourceSide || side === part.sourceSide) return { ...part };
  // Left-hand display mirrors the original right-hand geometry; source provenance
  // must remain distinct from the paired anatomical identifier shown to the user.
  return { ...part, id: part.pairedId || part.id, name: part.pairedName || part.name.replace(/\bright\b/i, 'left'),
    side, sourceId: part.id, sourceName: part.name, mirrored: true };
}
