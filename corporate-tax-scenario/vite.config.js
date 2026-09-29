import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built app can be hosted from any sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
