import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

export interface RequestContext {
  traceId: string;
  sessionId?: string;
  userId?: string;
  startTime: number;
}

// Create AsyncLocalStorage to store request context
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a trace ID for distributed tracing
 */
export const generateTraceId = (): string => {
  return crypto.randomUUID();
};

/**
 * Get the current request context
 */
export const getRequestContext = (): RequestContext | undefined => {
  return requestContextStorage.getStore();
};

/**
 * Get the current trace ID (serves as both traceId and requestId)
 */
export const getTraceId = (): string | undefined => {
  return getRequestContext()?.traceId;
};

/**
 * Get the current session ID
 */
export const getSessionId = (): string | undefined => {
  return getRequestContext()?.sessionId;
};

/**
 * Get the current user ID
 */
export const getUserId = (): string | undefined => {
  return getRequestContext()?.userId;
};

/**
 * Run a function with request context
 */
export const runWithContext = <T>(
  context: RequestContext,
  fn: () => T | Promise<T>,
): T | Promise<T> => {
  return requestContextStorage.run(context, fn);
};

/**
 * Update the request context with new values
 */
export const updateRequestContext = (
  updates: Partial<RequestContext>,
): void => {
  const context = getRequestContext();
  if (context) {
    Object.assign(context, updates);
  }
};

/**
 * Create a new request context
 */
export const createRequestContext = (
  sessionId?: string,
  userId?: string,
): RequestContext => {
  return {
    traceId: generateTraceId(),
    sessionId,
    userId,
    startTime: Date.now(),
  };
};
