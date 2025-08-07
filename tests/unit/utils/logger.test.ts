import { logger } from '../../../src/utils/logger';

// Mock winston
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    colorize: jest.fn(),
    printf: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
  addColors: jest.fn(),
}));

// Mock winston-cloudwatch
jest.mock('winston-cloudwatch', () => {
  return jest.fn().mockImplementation(() => ({
    log: jest.fn(),
  }));
});

describe('Logger', () => {
  it('should export a logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should have error method', () => {
    expect(logger.error).toBeDefined();
  });

  it('should have warn method', () => {
    expect(logger.warn).toBeDefined();
  });

  it('should have info method', () => {
    expect(logger.info).toBeDefined();
  });

  it('should have debug method', () => {
    expect(logger.debug).toBeDefined();
  });
});
