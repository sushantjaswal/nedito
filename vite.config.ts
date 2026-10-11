import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { brandPlugin } from "./vite.brand";
import { headersPlugin } from "./vite.headers";
import path from "node:path";

export default defineConfig({
  plugins: [react(), brandPlugin(), headersPlugin()],
  // Vite reads --port and server.port, never the PORT environment variable, so honouring it
  // here is what lets a tool assign the dev server a free port instead of colliding on 5173.
  // Nothing changes for `npm run dev` by hand: with no PORT set this is still 5173.
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
