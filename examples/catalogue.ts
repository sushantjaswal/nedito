// Every committed example and the builder that produces it. build.ts writes them all;
// examples.test.ts checks them all. Adding an example means one line here.
import { stampClassicLook } from "../src/model/look";
import type { DiagramDocument } from "../src/model/types";

export interface Example {
  /** The committed file, relative to examples/. */
  file: string;
  load: () => Promise<{ default: DiagramDocument }>;
}

// The examples were drawn before Nedito's own look and keep the look
// they were designed in, as the templates do: every shape and edge is marked classic.
const classic =
  (load: () => Promise<{ default: DiagramDocument }>) =>
  async (): Promise<{ default: DiagramDocument }> => ({ default: stampClassicLook((await load()).default) });

export const EXAMPLES: Example[] = [
  { file: "azure-landing-zone.nedito", load: classic(() => import("./build-azure-landing-zone")) },
  { file: "incident-runbook.nedito", load: classic(() => import("./build-incident-runbook")) },
  { file: "online-store-domain.nedito", load: classic(() => import("./build-online-store-domain")) },
];
