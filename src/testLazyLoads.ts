import { loadSection, SECTION_IDS } from "./library/stencils";
import { loadAllTemplates } from "./templates/registry";

/**
 * For tests only. Rendering the shape library or the app starts lazy loads in the background —
 * the stencil sections (Azure, AWS and GCP import about a thousand icons each) and the templates
 * — that nothing in the test awaits. Vitest 4 tears the environment down when the file's tests
 * end and reports any module still loading after that as an error, so a file that renders those
 * parts waits for every lazy load to finish in its afterAll. A load already under way is the same
 * module request, so this waits for it rather than starting a second one.
 */
export async function settleLazyLoads(): Promise<void> {
  await Promise.all([...SECTION_IDS.map((id) => loadSection(id)), loadAllTemplates()]);
}
