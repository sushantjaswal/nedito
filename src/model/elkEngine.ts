// The layout engine, loaded the first time someone tidies up a diagram and kept after that.
//
// It is about 400 KB over the wire, which is more than the rest of the editor's startup put
// together, so it is behind a dynamic import: a visitor who never runs a layout never downloads
// it. The engine is the in-process build rather than the worker one deliberately — the worker
// build fetches its own script at runtime, which the site's content security policy does not
// allow, and a level's layout takes a few milliseconds once the code is there.
import type { LayoutEngine } from "./layout";

let engine: Promise<LayoutEngine> | null = null;

export function loadLayoutEngine(): Promise<LayoutEngine> {
  engine ??= import("elkjs/lib/elk.bundled.js").then((module) => new module.default());
  return engine;
}
