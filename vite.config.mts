import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_SERVER = "http://localhost:4321";

export default defineConfig({
  root: "public-ui",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/parse": API_SERVER,
      "/generate": API_SERVER,
      "/progress": API_SERVER,
      "/news": API_SERVER,
      "/output": API_SERVER,
      "/timeline": API_SERVER,
      "/uploads": API_SERVER,
    },
  },
});
