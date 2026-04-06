import { z } from 'zod';

import { CV_API_BASE_URL, LOG_DIR } from '../constants';

const validLogTransports = ['console', 'file', 'cloudwatch'] as const;
type LogTransport = (typeof validLogTransports)[number];

const parseLogTransports = (value: string): LogTransport[] => {
  const parsedTransports = value
    .split(',')
    .map((transport) => transport.trim())
    .filter(Boolean);

  if (parsedTransports.length === 0) {
    throw new Error(
      `LOG_TRANSPORT must include at least one value: ${validLogTransports.join(', ')}`,
    );
  }

  const invalidTransports = parsedTransports.filter(
    (transport) =>
      !validLogTransports.includes(transport as LogTransport),
  );

  if (invalidTransports.length > 0) {
    throw new Error(
      `Invalid LOG_TRANSPORT value(s): ${invalidTransports.join(', ')}. ` +
        `Allowed values: ${validLogTransports.join(', ')}`,
    );
  }

  return [...new Set(parsedTransports as LogTransport[])];
};

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
  MCP_RESOURCE_METADATA_URL: z
    .string()
    .url()
    .or(z.string().regex(/^\/.*/, 'Must be an absolute path or URL'))
    .optional()
    .transform(
      (val) => val || '/.well-known/oauth-protected-resource',
    ),
  LOG_TRANSPORT: z
    .string()
    .optional()
    .default('file')
    .transform((val, ctx) => {
      try {
        return parseLogTransports(val);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            error instanceof Error
              ? error.message
              : 'Invalid LOG_TRANSPORT value',
        });

        return z.NEVER;
      }
    }),
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

export const isTestEnvironment = () => {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();

  return nodeEnv === 'test';
};

export const env = getEnvironment();
