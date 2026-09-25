import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({ plugins: [{
  name: 'contain-transition-compat',
  enforce: 'pre',
  transform(code, id) {
    // contain-css-svelte (1.2.3 and still 1.3.0) has an invalid custom-property name in
    // Toggle/Checkbox/RadioButton that Vite 8's lightningcss rejects. Same workaround as
    // google-classroom-sync-web. Remove once fixed upstream (it's Tom's library).
    if (id.includes('/contain-css-svelte/') && id.endsWith('.svelte')) {
      return code.replaceAll('var(--180ms ease-transition, var(--transition, 300ms))', 'var(--transition, 180ms ease)');
    }
  },
}, svelte()] });
