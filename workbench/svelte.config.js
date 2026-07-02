import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // Handles <script lang="ts"> — plain Vite needs this spelled out explicitly
  // (Astro-based projects get it for free from the framework integration).
  preprocess: vitePreprocess(),
};
