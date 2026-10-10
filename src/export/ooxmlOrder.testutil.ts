// Schema-order checking for any OOXML part, shared by the PowerPoint and Word exporter tests.
//
// OOXML types are declared as xsd:sequence, so child element ORDER is part of validity, not
// formatting. Office enforces it and reports a violation only as "can't read <file>" — no element
// named, no hint which part is wrong. That is how the PowerPoint export failed three times before
// D61 walked every generated part against its schema; this module is that walker, with each
// format's sequences supplied by its own test.

/**
 * Schema sequences, keyed by element name. Order is the schema's, not ours.
 *
 * An entry may be a single element name, or an array of names sharing one position — that is how
 * a repeating xsd:choice is expressed (a `w:body` holds paragraphs and tables in any order, then
 * `w:sectPr` last). Children not named in a type's sequence are ignored rather than reported: the
 * table lists what the exporter emits, not the whole schema.
 */
export type Sequences = Record<string, (string | string[])[]>;

export interface Violation {
  path: string;
  message: string;
}

export function parse(xml: string, path: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error(`${path} is not well-formed`);
  return doc;
}

/**
 * Walks `el` and everything under it, recording every child that appears after a sibling the
 * schema says must come later. `extra` runs on every element too, for rules that are not about
 * order (PowerPoint's colour-mapping override, whose twelve attributes are all required).
 */
export function checkElement(
  el: Element,
  path: string,
  out: Violation[],
  sequences: Sequences,
  extra?: (el: Element, path: string, out: Violation[]) => void,
): void {
  const sequence = sequences[el.nodeName];
  if (sequence) {
    const positionOf = (name: string) =>
      sequence.findIndex((step) => (Array.isArray(step) ? step.includes(name) : step === name));

    let highest = -1;
    let previous = "";
    for (const child of Array.from(el.children)) {
      const index = positionOf(child.nodeName);
      if (index === -1) continue;
      if (index < highest) {
        out.push({ path, message: `<${el.nodeName}>: <${child.nodeName}> must come before <${previous}>` });
      } else {
        highest = index;
        previous = child.nodeName;
      }
    }
  }
  extra?.(el, path, out);
  for (const child of Array.from(el.children)) checkElement(child, path, out, sequences, extra);
}

/** Checks every XML part of a package, given as path → bytes. */
export function violationsInParts(
  parts: Map<string, Uint8Array>,
  sequences: Sequences,
  extra?: (el: Element, path: string, out: Violation[]) => void,
): Violation[] {
  const out: Violation[] = [];
  for (const [path, bytes] of parts) {
    if (!path.endsWith(".xml") && !path.endsWith(".rels")) continue;
    checkElement(parse(new TextDecoder().decode(bytes), path).documentElement, path, out, sequences, extra);
  }
  return out;
}
