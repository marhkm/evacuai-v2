import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Admin "Campus 3D" page bundle: one self-contained script (three.js included), exposed as window.EvacuCampus3D.
// Committed like the campus snapshots; CI checks it is up to date (npm run build:3d).
export default defineConfig({
  build: {
    lib: { entry: fileURLToPath(new URL('src/mount.ts', import.meta.url)), name: 'EvacuCampus3D', formats: ['iife'], fileName: () => 'campus-3d.js' },
    outDir: fileURLToPath(new URL('../../api/public/js', import.meta.url)),
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
  },
});
