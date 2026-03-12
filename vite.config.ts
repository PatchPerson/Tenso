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
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
