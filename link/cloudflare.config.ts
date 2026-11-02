import { bindings, defineConfig, triggers } from 'cf/config';
export default defineConfig({
  accountId: '0841846b8b26c33af25c397be486312d',
  worker: {
    name: 'bobee-link',
    entrypoint: './worker.mjs',
    compatibilityDate: '2026-11-02',
    assets: { runWorkerFirst: true },
    env: { DB: bindings.d1({ name: 'bobee-link', id: 'f64efb30-f159-46f8-8112-ecd5023f4e77' }), ASSETS: bindings.assets(), SETUP_KEY: bindings.secret() },
    triggers: [triggers.scheduled({ schedule: '0 3 * * *' })],
  },
});
