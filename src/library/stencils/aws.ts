// The full official AWS architecture service icon set (305 icons, 48px size tier; see NOTICE
// at repo root for source and license terms). Icons render via `raw` (own colors/viewBox,
// never themed). Bulk-imported — see assets/aws/manifest.ts for provenance and how to
// regenerate.
import manifest from "./assets/aws/manifest";
import type { StencilSection } from "./types";
import { buildVendorStencils } from "./vendorIcons";

const modules = import.meta.glob("./assets/aws/**/*.svg", { eager: true, query: "?raw", import: "default" }) as Record<
  string,
  string
>;

const section: StencilSection = {
  id: "aws",
  name: "AWS",
  shapes: buildVendorStencils(modules, manifest),
};

export default section;
