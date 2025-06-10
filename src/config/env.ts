import dotenv from 'dotenv';
import { z } from 'zod/v4';

dotenv.config();

const Environment = z.object({
  CARBON_VOICE_BASE_URL: z.url().nonempty(),
  CARBON_VOICE_API_KEY: z.string().nonempty(),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .optional()
    .default('info'),
});

const getEnvironment = (): z.infer<typeof Environment> => {
  try {
    return Environment.parse(process.env);
  } catch (error) {
    console.error('Error getting environment variables', error);
    process.exit(1);
  }
};

export const env = getEnvironment();
