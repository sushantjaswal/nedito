// The full official Microsoft Azure architecture icon set (714 icons; see NOTICE at repo root
// for source and license terms). Icons render via `raw` (own colors/viewBox, never themed) per
// Microsoft's icon terms: "Use the icons as they would appear within Azure." Bulk-imported —
// see assets/azure/manifest.ts for provenance and how to regenerate.
import manifest from "./assets/azure/manifest";
import type { StencilSection } from "./types";
import { buildVendorStencils } from "./vendorIcons";

const modules = import.meta.glob("./assets/azure/**/*.svg", { eager: true, query: "?raw", import: "default" }) as Record<
  string,
  string
>;

const section: StencilSection = {
  id: "azure",
  name: "Azure",
  shapes: buildVendorStencils(modules, manifest),
};

export default section;
