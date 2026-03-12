import { defineConfig } from "vite";
import { readFileSync } from "fs";
import solid from "vite-plugin-solid";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/solid-js")) return "vendor-solid";
          if (id.includes("node_modules/convex")) return "vendor-convex";
          if (id.includes("node_modules/@codemirror")) return "vendor-codemirror";
          if (id.includes("node_modules/@sentry")) return "vendor-sentry";
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
