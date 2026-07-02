import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // Handles <script lang="ts"> in the reused site components (the website gets
  // this from Astro's svelte integration; plain Vite needs it spelled out).
  preprocess: vitePreprocess(),
};
