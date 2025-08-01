import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';

import { logger } from './logger';
import { obfuscateAuthHeaders } from './obfuscate-auth-headers';
import { timeToHuman } from './time-to-human';

import { env } from '../config';
import { getTraceId } from '../transports/http/utils/request-context';

// Extend the config type to include metadata
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: {
    startTime: number;
  };
}

// Define common error types
interface ApiError {
  statusCode: number;
  body: {
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
    traceId?: string;
  };
}

interface NetworkError {
  statusCode: number;
  body: {
    error: {
      code: 'NETWORK_ERROR';
      message: string;
      details?: Record<string, unknown>;
    };
    traceId?: string;
  };
}

interface ErrorResponseData {
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Routes that should not be logged
 */
const NOT_LOG_ROUTES = ['/health'];

const serializeAxiosError = (error: AxiosError): Record<string, unknown> => {
  return {
    message: error.message,
    code: error.code,
    status: error.response?.status,
    statusText: error.response?.statusText,
    data: error.response?.data,
    url: error.config?.url,
    method: error.config?.method?.toUpperCase(),
    timeout: error.config?.timeout,
  };
};

// Create the axios instance
const getAxiosInstance = (): AxiosInstance => {
  const baseUrl = env.CARBON_VOICE_BASE_URL || 'https://api.carbonvoice.app';

  // if (!env.CARBON_VOICE_API_KEY) {
  //   throw {
  //     statusCode: 0,
  //     body: {
  //       error: {
  //         code: 'CONFIGURATION_ERROR',
  //         message: 'CARBON_VOICE_API_KEY is not set',
  //         details: { api_key: env.CARBON_VOICE_API_KEY },
  //       },
  //     },
  //   };
  // }

  const instance = axios.create({
    baseURL: baseUrl,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CARBON_VOICE_API_KEY,
    },
  });

  // Add request interceptor for logging
  instance.interceptors.request.use(
    (config) => {
      if (NOT_LOG_ROUTES.includes(config.url ?? '')) {
        return config;
      }

      // Add start time to config metadata for duration calculation
      (config as ExtendedAxiosRequestConfig).metadata = {
        startTime: Date.now(),
      };

      const method = config.method?.toUpperCase();
      const url = config.url;

      logger.debug(`➡️ Making API request to: ${method} ${url}`, {
        url: config.url,
        method: config.method,
        params: config.params,
        data: config.data,
        headers: obfuscateAuthHeaders(config.headers),
      });
      return config;
    },
    (error) => {
      logger.error('❌ Request setup error', {
        url: error.config?.url,
        method: error.config?.method,
        message: error.message,
      });
      return Promise.reject(error);
    },
  );

  // Add response interceptor for logging
  instance.interceptors.response.use(
    (response) => {
      if (NOT_LOG_ROUTES.includes(response.config.url ?? '')) {
        return response;
      }

      // Calculate request duration
      const startTime = (response.config as ExtendedAxiosRequestConfig).metadata
        ?.startTime;
      const duration = startTime ? Date.now() - startTime : undefined;

      const method = response.config.method?.toUpperCase();
      const status = response.status;
      const url = response.config.url;
      const durationText = duration ? timeToHuman(duration, 'ms') : '';

      logger.debug(
        `⬅️ API response received from: ${method} ${url} ${status} ${durationText}`,
        {
          url: response.config.url,
          method: response.config.method,
          status: response.status,
          statusText: response.statusText,
          duration: duration || undefined,
        },
      );
      return response;
    },
    (error) => {
      if (axios.isAxiosError(error)) {
        const axiosError = handleAxiosError(error);

        // Calculate request duration for errors too
        const startTime = (error.config as ExtendedAxiosRequestConfig)?.metadata
          ?.startTime;
        const duration = startTime ? Date.now() - startTime : undefined;

        if (NOT_LOG_ROUTES.includes(error.config?.url ?? '')) {
          return Promise.reject(error);
        }
        const durationText = duration ? timeToHuman(duration, 'ms') : '';
        const method = error.config?.method?.toUpperCase();
        const url = error.config?.url;
        const status = error.response?.status;
        // Log the error with all relevant details
        logger.error(
          `❌ API request failed: ${method} ${url} ${status} ${durationText}`,
          {
            error: {
              statusCode: axiosError?.statusCode,
              body: {
                message: axiosError?.body?.error?.message,
                code: axiosError?.body?.error?.code,
              },
            },
            url: error.config?.url,
            method: error.config?.method,
            status: error.response?.status,
            statusText: error.response?.statusText,
            requestData: error.config?.data,
            responseData: error.response?.data,
            duration: duration,
          },
        );
      } else {
        if (NOT_LOG_ROUTES.includes(error.config?.url ?? '')) {
          return Promise.reject(error);
        }

        logger.error('❌ Unexpected error in API request', {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
      }
      return Promise.reject(error);
    },
  );

  return instance;
};

// Error handling function
function handleAxiosError(error: AxiosError): ApiError | NetworkError {
  const serializedError = serializeAxiosError(error);
  const traceId = getTraceId();
  if (error.response) {
    const statusCode = error.response.status;
    const errorData = error.response.data as ErrorResponseData;
    // Handle different HTTP status codes
    switch (statusCode) {
      case 400:
        return {
          statusCode,
          body: {
            error: {
              code: 'BAD_REQUEST',
              message: errorData?.message || 'Invalid request parameters',
              details: serializedError,
            },
            traceId,
          },
        };
      case 401:
        return {
          statusCode,
          body: {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              details: { reason: 'Invalid or missing API key' },
            },
            traceId,
          },
        };
      case 403:
        return {
          statusCode,
          body: {
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
              details: { reason: 'Insufficient permissions' },
            },
            traceId,
          },
        };
      case 404:
        return {
          statusCode,
          body: {
            error: {
              code: 'NOT_FOUND',
              message: errorData?.message || 'Resource not found',
              details: serializedError,
            },
            traceId,
          },
        };
      case 429:
        return {
          statusCode,
          body: {
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests',
              details: { retryAfter: error.response.headers['retry-after'] },
            },
            traceId,
          },
        };
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          statusCode,
          body: {
            error: {
              code: 'SERVER_ERROR',
              message: 'Internal server error',
              details: serializedError,
            },
            traceId,
          },
        };
      default:
        return {
          statusCode,
          body: {
            error: {
              code: 'UNKNOWN_ERROR',
              message: errorData?.message || 'An unexpected error occurred',
              details: serializedError,
            },
            traceId: getTraceId(),
          },
        };
    }
  } else if (error.request) {
    return {
      statusCode: 0,
      body: {
        error: {
          code: 'NETWORK_ERROR',
          message: 'No response received from server',
          details: serializedError,
        },
        traceId: getTraceId(),
      },
    };
  } else {
    return {
      statusCode: 0,
      body: {
        error: {
          code: 'REQUEST_ERROR',
          message: error.message || 'Error setting up the request',
          details: serializedError,
        },
        traceId,
      },
    };
  }
}

// Create the singleton instance
const axiosInstance = getAxiosInstance();

// Define the mutator function that Orval expects
export async function mutator<T>(
  { url, method, params, data, headers }: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await axiosInstance({
      url,
      method,
      params,
      data,
      headers,
      ...options,
    });

    return response.data as T;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = handleAxiosError(error);
      throw axiosError;
    }
    // Handle non-axios errors
    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    throw {
      statusCode: 0,
      body: {
        error: {
          code: 'UNKNOWN_ERROR',
          message: errorMessage,
          details: { originalError: error },
          traceId: getTraceId(),
        },
      },
    } as ApiError;
  }
}

// Export the instance for other uses
export const customAxios = axiosInstance;

// Export error types for use in other files
export type { ApiError, NetworkError, ErrorResponseData };
