import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
const originalsPresent = [
  "public/documents",
  "public/data/ground/logs",
  "public/data/field/quality",
].every((path) => existsSync(new URL(path, import.meta.url)));
const sourceMode =
  originalsPresent && process.env.VITE_SOURCE_ACCESS !== "derived"
    ? "full"
    : "derived";
const commit = /^[a-f0-9]{40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA || "")
  ? process.env.VERCEL_GIT_COMMIT_SHA!
  : "local";
export default defineConfig({
  define: { __HAS_PROVIDED_ORIGINALS__: JSON.stringify(originalsPresent) },
  plugins: [
    react(),
    {
      name: "autogeo-build-identity",
      transformIndexHtml(html) {
        return html.replace(
          "</head>",
          `<meta name="autogeo-build" content="${commit}"></head>`,
        );
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({
            app: "AutoGeo",
            commit,
            built_at: new Date().toISOString(),
            site_id: "icheon-xi-deriche",
            source_mode: sourceMode,
          }),
        });
      },
    },
  ],
  build: {
    chunkSizeWarningLimit: 850,
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
  },
});
