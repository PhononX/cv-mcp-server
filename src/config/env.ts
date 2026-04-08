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
  /** Idle TTL (ms): session is destroyed after this long without activity; refreshed on each interaction. */
  MCP_SESSION_TTL_MS: z
    .string()
    .optional()
    .default(String(1000 * 60 * 60))
    .transform((s) => {
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error('MCP_SESSION_TTL_MS must be a positive number');
      }
      return n;
    }),
  MCP_SESSION_MAX_SESSIONS: z
    .string()
    .optional()
    .default('2000')
    .transform((s) => {
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        throw new Error(
          'MCP_SESSION_MAX_SESSIONS must be a positive integer',
        );
      }
      return n;
    }),
  MCP_SESSION_CLEANUP_INTERVAL_MS: z
    .string()
    .optional()
    .default(String(1000 * 60 * 5))
    .transform((s) => {
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(
          'MCP_SESSION_CLEANUP_INTERVAL_MS must be a positive number',
        );
      }
      return n;
    }),
  /**
   * Optional absolute max session lifetime (ms) from createdAt.
   * 0 = disabled (sliding idle only). When set, idle extension cannot push expiresAt past createdAt + max age.
   */
  MCP_SESSION_MAX_AGE_MS: z
    .string()
    .optional()
    .default('0')
    .transform((s) => {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        throw new Error(
          'MCP_SESSION_MAX_AGE_MS must be a non-negative integer (0 disables)',
        );
      }
      return n;
    }),
  /**
   * TEMPORARY incident diagnostics toggle for MCP transport send path.
   * Keep disabled by default and enable only during active production investigation.
   */
  MCP_TRANSPORT_DIAGNOSTICS_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((value) => value.toLowerCase() === 'true'),
  /**
   * Phase 1 mitigation: max time (ms) a tools/call request can wait in the per-session queue.
   * Requests exceeding this wait fail fast with a deterministic JSON-RPC timeout error.
   */
  MCP_TOOL_CALL_QUEUE_TIMEOUT_MS: z
    .string()
    .optional()
    .default('15000')
    .transform((s) => {
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        throw new Error(
          'MCP_TOOL_CALL_QUEUE_TIMEOUT_MS must be a positive integer',
        );
      }
      return n;
    }),
  /**
   * Max time (ms) any session-bound POST request can wait in the per-session queue.
   * Defaults to MCP_TOOL_CALL_QUEUE_TIMEOUT_MS behavior for backward compatibility.
   */
  MCP_SESSION_REQUEST_QUEUE_TIMEOUT_MS: z
    .string()
    .optional()
    .default(process.env.MCP_TOOL_CALL_QUEUE_TIMEOUT_MS || '15000')
    .transform((s) => {
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        throw new Error(
          'MCP_SESSION_REQUEST_QUEUE_TIMEOUT_MS must be a positive integer',
        );
      }
      return n;
    }),
  /**
   * Safety timeout for transport execution after a queue slot is acquired.
   * Prevents indefinite hangs inside transport.handleRequest for a reused session.
   */
  MCP_TRANSPORT_EXECUTION_TIMEOUT_MS: z
    .string()
    .optional()
    .default('30000')
    .transform((s) => {
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        throw new Error(
          'MCP_TRANSPORT_EXECUTION_TIMEOUT_MS must be a positive integer',
        );
      }
      return n;
    }),
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
