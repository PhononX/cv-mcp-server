import { defineConfig } from 'orval';
import { env } from './src/config';

export default defineConfig({
  carbonVoice: {
    input: `${env.CARBON_VOICE_BASE_URL}/docs/simplified-json`, // OpenAPI schema URL
    // input: './carbon-voice-api.json',
    output: {
      target: './src/generated/carbon-voice-api.ts',
      // client: 'axios',
      schemas: './src/generated/zod-schemas',
      // mode: 'tags-split', // Each tag = one file
      override: {
        mutator: {
          path: './src/utils/axios-instance.ts',
          name: 'mutator',
          default: false,
        },
        // transformer: './build/utils/zod-transformer.cjs', // ✅ singular, not "transformers"
      },
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write ./src/generated',
    },
  },
});
