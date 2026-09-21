import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const commit = /^[a-f0-9]{40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA || "")
  ? process.env.VERCEL_GIT_COMMIT_SHA!
  : "local";
export default defineConfig({
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
