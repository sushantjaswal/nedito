// Peek (A5, CLAUDE_HISTORY.md D121): a Nested Block with Peek set stirs on the first time it is
// seen this session, then never again — even as the canvas re-renders, or the reader leaves the
// level and comes back. Session memory only.
const seen = new Set<string>();

/** True the first time a block is asked about; false every time after. */
export function firstPeek(nestedNodeId: string): boolean {
  if (seen.has(nestedNodeId)) return false;
  seen.add(nestedNodeId);
  return true;
}

/** Tests only. */
export function resetPeeksForTests(): void {
  seen.clear();
}
