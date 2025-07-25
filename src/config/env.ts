import { z } from 'zod';

import { CV_API_BASE_URL, LOG_DIR } from '../constants';

const getRunningEnvironment = (): 'prod' | 'dev' => {
  // App Runner provides service name in environment
  const serviceName = process.env.AWS_APPRUNNER_SERVICE_NAME || '';

  if (serviceName.includes('prod')) {
    return 'prod';
  }
  return 'dev';
};

const Environment = z.object({
  CARBON_VOICE_BASE_URL: z
    .string()
    .url()
    .nullable()
    .optional()
    .transform((val) => val || CV_API_BASE_URL),
  CARBON_VOICE_API_KEY: z.string().optional(),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .optional()
    .default('info'),
  LOG_DIR: z
    .string()
    .optional()
    .transform((val) => val || LOG_DIR),
  PORT: z.string().optional().default('3005'),
  LOG_TRANSPORT: z
    .enum(['console', 'file', 'cloudwatch'])
    .optional()
    .default('file'),
  ENVIRONMENT: z
    .enum(['dev', 'prod'])
    .optional()
    .default(getRunningEnvironment()),
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
