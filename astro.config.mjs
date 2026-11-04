import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://headway.shivrajsinh.in',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  compressHTML: true,
  devToolbar: { enabled: false },
});
