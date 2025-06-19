import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';

import { logger } from './logger';

import { env } from '../config';

// Define common error types
interface ApiError {
  statusCode: number;
  body: {
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
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
  };
}

interface ErrorResponseData {
  message?: string;
  details?: Record<string, unknown>;
}

// Create the axios instance
const getAxiosInstance = (): AxiosInstance => {
  const baseUrl = env.CARBON_VOICE_BASE_URL || 'https://api.carbonvoice.app';

  if (!env.CARBON_VOICE_API_KEY) {
    throw {
      statusCode: 0,
      body: {
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'CARBON_VOICE_API_KEY is not set',
          details: { api_key: env.CARBON_VOICE_API_KEY },
        },
      },
    };
  }

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
      logger.debug('Making API request', {
        url: config.url,
        method: config.method,
        params: config.params,
        data: config.data,
        headers: { ...config.headers, 'x-api-key': '[REDACTED]' },
      });
      return config;
    },
    (error) => {
      logger.error('Request setup error', {
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
      logger.debug('API response received', {
        url: response.config.url,
        method: response.config.method,
        status: response.status,
        statusText: response.statusText,
      });
      return response;
    },
    (error) => {
      if (axios.isAxiosError(error)) {
        const axiosError = handleAxiosError(error);
        // Log the error with all relevant details
        logger.error('API request failed', {
          error: axiosError,
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          requestData: error.config?.data,
          responseData: error.response?.data,
        });
      } else {
        logger.error('Unexpected error in API request', error);
      }
      return Promise.reject(error);
    },
  );

  return instance;
};

// Error handling function
function handleAxiosError(error: AxiosError): ApiError | NetworkError {
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
              details:
                errorData?.details || (errorData as Record<string, unknown>),
            },
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
          },
        };
      case 404:
        return {
          statusCode,
          body: {
            error: {
              code: 'NOT_FOUND',
              message: errorData?.message || 'Resource not found',
              details: errorData?.details,
            },
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
              details: { originalError: errorData },
            },
          },
        };
      default:
        return {
          statusCode,
          body: {
            error: {
              code: 'UNKNOWN_ERROR',
              message: errorData?.message || 'An unexpected error occurred',
              details: errorData as Record<string, unknown>,
            },
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
          details: {
            request: error.request,
            message: error.message,
          },
        },
      },
    };
  } else {
    return {
      statusCode: 0,
      body: {
        error: {
          code: 'REQUEST_ERROR',
          message: error.message || 'Error setting up the request',
          details: { originalError: error },
        },
      },
    };
  }
}

// Create the singleton instance
const axiosInstance = getAxiosInstance();

// Define the mutator function that Orval expects
export async function mutator<T>({
  url,
  method,
  params,
  data,
  headers,
}: AxiosRequestConfig): Promise<T> {
  try {
    const response = await axiosInstance({
      url,
      method,
      params,
      data,
      headers,
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
        },
      },
    } as ApiError;
  }
}

// Export the instance for other uses
export const customAxios = axiosInstance;

// Export error types for use in other files
export type { ApiError, NetworkError, ErrorResponseData };
