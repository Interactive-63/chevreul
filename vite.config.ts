// Developed by Interactive 63 (https://interactive63.com)
//
// Build and test configuration: Tailwind runs as a Vite plugin, and Vitest reads tests from the root tests/ folder.
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss()],
  // Small assets stay as files, as the content security policy in public/_headers refuses data: URLs.
  build: { assetsInlineLimit: 0 },
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});
