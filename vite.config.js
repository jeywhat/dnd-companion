import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@3d-dice/dice-box"]
  }
});
