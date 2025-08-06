import { CV_API_BASE_URL } from '../../../src/constants';

// Mock process.env
const originalEnv = process.env;

describe('Environment Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load default values when no environment variables are set', () => {
    // Clear all env vars
    process.env = {};

    // Re-import to get fresh config
    jest.resetModules();
    const { env: freshEnv } = require('../../../src/config/env');

    expect(freshEnv.LOG_LEVEL).toBe('info');
    expect(freshEnv.PORT).toBe('3005');
    expect(freshEnv.LOG_TRANSPORT).toBe('file');
    expect(freshEnv.ENVIRONMENT).toBe('dev');
  });

  it('should load custom environment variables', () => {
    process.env.LOG_LEVEL = 'debug';
    process.env.PORT = '8080';
    process.env.LOG_TRANSPORT = 'console';
    process.env.CARBON_VOICE_API_KEY = 'test-key';

    // Re-import to get fresh config
    jest.resetModules();
    const { env: freshEnv } = require('../../../src/config/env');

    expect(freshEnv.LOG_LEVEL).toBe('debug');
    expect(freshEnv.PORT).toBe('8080');
    expect(freshEnv.LOG_TRANSPORT).toBe('console');
    expect(freshEnv.CARBON_VOICE_API_KEY).toBe('test-key');
  });

  it('should handle production environment detection', () => {
    process.env.AWS_APPRUNNER_SERVICE_NAME = 'my-service-prod';

    // Re-import to get fresh config
    jest.resetModules();
    const { env: freshEnv } = require('../../../src/config/env');

    expect(freshEnv.ENVIRONMENT).toBe('prod');
  });

  it('should handle development environment detection', () => {
    process.env.AWS_APPRUNNER_SERVICE_NAME = 'my-service-dev';

    // Re-import to get fresh config
    jest.resetModules();
    const { env: freshEnv } = require('../../../src/config/env');

    expect(freshEnv.ENVIRONMENT).toBe('dev');
  });

  it('should default to development when no service name', () => {
    delete process.env.AWS_APPRUNNER_SERVICE_NAME;

    // Re-import to get fresh config
    jest.resetModules();
    const { env: freshEnv } = require('../../../src/config/env');

    expect(freshEnv.ENVIRONMENT).toBe('dev');
  });

  it('should validate LOG_LEVEL enum values', () => {
    const validLevels = ['debug', 'info', 'warn', 'error'];

    validLevels.forEach((level) => {
      process.env.LOG_LEVEL = level;

      // Re-import to get fresh config
      jest.resetModules();
      const { env: freshEnv } = require('../../../src/config/env');

      expect(freshEnv.LOG_LEVEL).toBe(level);
    });
  });

  it('should validate LOG_TRANSPORT enum values', () => {
    const validTransports = ['console', 'file', 'cloudwatch'];

    validTransports.forEach((transport) => {
      process.env.LOG_TRANSPORT = transport;

      // Re-import to get fresh config
      jest.resetModules();
      const { env: freshEnv } = require('../../../src/config/env');

      expect(freshEnv.LOG_TRANSPORT).toBe(transport);
    });
  });

  it('should handle CARBON_VOICE_BASE_URL with valid URL', () => {
    process.env.CARBON_VOICE_BASE_URL = 'https://api.example.com';

    // Re-import to get fresh config
    jest.resetModules();
    const { env: freshEnv } = require('../../../src/config/env');

    expect(freshEnv.CARBON_VOICE_BASE_URL).toBe('https://api.example.com');
  });

  it('should use default CARBON_VOICE_BASE_URL when not provided', () => {
    delete process.env.CARBON_VOICE_BASE_URL;

    // Re-import to get fresh config
    jest.resetModules();
    const { env: freshEnv } = require('../../../src/config/env');

    expect(freshEnv.CARBON_VOICE_BASE_URL).toBe(CV_API_BASE_URL);
  });

  describe('isTestEnvironment', () => {
    it('should return true when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      const {
        isTestEnvironment: isTestLowercase,
      } = require('../../../src/config/env');

      expect(isTestLowercase()).toBe(true);

      process.env.NODE_ENV = 'TEST';
      const {
        isTestEnvironment: isTestUppercase,
      } = require('../../../src/config/env');

      expect(isTestUppercase()).toBe(true);
    });

    it('should return false when NODE_ENV is not test', () => {
      process.env.NODE_ENV = 'dev';
      const { isTestEnvironment } = require('../../../src/config/env');
      expect(isTestEnvironment()).toBe(false);
    });
  });
});
