import { defineConfig } from 'orval';
import { env } from './src/config';

export default defineConfig({
  carbonVoice: {
    input: `${env.CARBON_VOICE_BASE_URL}/docs/simplified-json`, // OpenAPI schema URL
    output: {
      target: './src/generated/carbon-voice-api.ts',
      client: 'axios', // Use axios client
      schemas: './src/generated/models',
      mode: 'split',
      namingConvention: 'PascalCase',
      indexFiles: true,
      prettier: true,
      override: {
        mutator: {
          path: './src/utils/axios-instance.ts',
          name: 'mutator',
          default: false,
        },
      },
    },
    // hooks: {
    //   afterAllFilesWrite: 'prettier --write ./src/generated',
    // },
  },
  carbonVoiceZod: {
    input: `${env.CARBON_VOICE_BASE_URL}/docs/simplified-json`, // OpenAPI schema URL
    output: {
      target: './src/generated/carbon-voice-api',
      client: 'zod',
      mode: 'split',
      fileExtension: '.zod.ts',
      namingConvention: 'PascalCase',
      indexFiles: true,
    },
  },
});
