import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    // tests/e2e/**/*.spec.ts are Playwright specs (run via `npm run test:e2e`), not Vitest —
    // Vitest's default include pattern would otherwise try to collect them too. Extends
    // (not replaces) Vitest's own default exclusions.
    // .claude/ holds other sessions' git worktrees — whole copies of the repo — which are not
    // this checkout's tests (D110).
    exclude: [...configDefaults.exclude, "tests/e2e/**", ".claude/**"],
    // Azure/AWS/GCP's full vendor icon sets (see vendorIcons.ts) are ~1000 SVGs transformed
    // via import.meta.glob — the first test file touching one of those modules pays that
    // transform cost once, which alone can exceed Vitest's 5s default.
    testTimeout: 20000,
    // Vitest stubs CSS to nothing by default. The two global motion sheets are also read as text
    // by the GIF export (file/motionFrameCss.ts, D131), so its tests need their real contents.
    css: { include: [/styles[\\/](motion|animatedIcons)\.css/] },
  },
});
