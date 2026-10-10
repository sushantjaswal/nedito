// Shared helpers for the example builders.
//
// Every example is generated, never hand-edited, and the generator must be *reproducible*:
// rebuilding an unchanged example has to produce the committed file byte for byte, or every
// rebuild churns the diff and nobody can tell a real change from noise. The Azure builder claimed
// this and did not deliver it — its layers came from createDefaultLayers(), which mints a fresh
// nanoid each call, so each rebuild rewrote four ids. Hence `layer()`
// below, and examples.test.ts, which rebuilds every example and compares.
import type { Layer } from "../src/model/types";

/**
 * A readable id that still satisfies the format's "unique nanoid string" rule: the nanoid alphabet
 * includes "_", so a slug padded to 21 characters is legal and never changes between builds.
 */
export function id(slug: string): string {
  if (slug.length > 21) throw new Error(`id slug too long: ${slug}`);
  return slug.padEnd(21, "_");
}

/** A diagram's layer list, with a deterministic id derived from the diagram's slug. */
export function layers(diagramSlug: string, extra: Omit<Layer, "id">[] = []): Layer[] {
  return [
    { id: id(`L${diagramSlug}`), name: "Layer 1", visible: true, locked: false },
    ...extra.map((l, i) => ({ ...l, id: id(`L${diagramSlug}${i + 2}`) })),
  ];
}

/** One date for every example, so a rebuild on a different day changes nothing. */
export const EXAMPLE_DATE = "2026-09-23T00:00:00.000Z";
