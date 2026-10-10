// The full official Google Cloud icon set (45 icons: 26 category icons + 19 core product
// icons; see NOTICE at repo root for source and license terms). Icons render via `raw` (own
// colors/viewBox, never themed). Bulk-imported — see assets/gcp/manifest.ts for provenance and
// how to regenerate.
import manifest from "./assets/gcp/manifest";
import type { StencilSection } from "./types";
import { buildVendorStencils } from "./vendorIcons";

const modules = import.meta.glob("./assets/gcp/**/*.svg", { eager: true, query: "?raw", import: "default" }) as Record<
  string,
  string
>;

const section: StencilSection = {
  id: "gcp",
  name: "GCP",
  shapes: buildVendorStencils(modules, manifest),
};

export default section;
