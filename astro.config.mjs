import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import emdash from 'emdash/astro';
import { d1, r2 } from '@emdash-cms/cloudflare';

const offline = process.env.OFFLINE_EXPORT === '1';
export default defineConfig({
  output: offline ? 'static' : 'server',
  outDir: offline ? './.offline-build' : './dist',
  build: { format: 'directory' },
  ...(offline ? {} : { adapter: cloudflare({ imageService: 'passthrough' }) }),
  integrations: offline ? [] : [react(), emdash({ database: d1({ binding: 'DB' }), storage: r2({ binding: 'MEDIA' }) })],
  ...(offline ? { vite: { resolve: { alias: [{ find: /^emdash$/, replacement: new URL('./scripts/offline-cms.mjs', import.meta.url).pathname }] } } } : {}),
});
