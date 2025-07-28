import fs from 'fs';
import path from 'path';

import winston from 'winston';
import WinstonCloudwatch from 'winston-cloudwatch';

import { env } from '../config';
import { LOG_DIR, SERVICE_VERSION } from '../constants';

// Custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

const getLogLevel = () => {
  return env.LOG_LEVEL || 'info';
};

// Create file transports
// const logDir = path.join(process.cwd(), 'logs');

// Prefer env var, fallback to project-relative folder
const logDir = process.env.LOG_DIR || LOG_DIR;

const createLogDir = (logDir: string) => {
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (error) {
      console.error('Error creating log directory', error);
    }
  }
  console.error('logs_dir', logDir);
};

// Create log files
const errorLogFile = path.join(logDir, 'error.log');
const combinedLogFile = path.join(logDir, 'combined.log');

const transports: Record<
  'file' | 'console' | 'cloudwatch',
  winston.transport[]
> = {
  file: [
    // Error log file
    new winston.transports.File({
      filename: errorLogFile,
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
    // Combined log file - set to same level as logger
    new winston.transports.File({
      filename: combinedLogFile,
      level: getLogLevel(), // Use same level as logger
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
  console: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:SSS' }),
        winston.format.colorize({ all: true }),
        winston.format.printf(({ timestamp, level, message, ...metadata }) => {
          let output = `${timestamp} [${env.ENVIRONMENT}] ${level}: ${message}`;
          if (Object.keys(metadata).length > 0) {
            metadata.environment = env.ENVIRONMENT; // Add environment to metadata
            metadata.version = SERVICE_VERSION;
            output += '\n' + JSON.stringify(metadata, null, 2);
          }
          return output;
        }),
      ),
    }),
  ],
  cloudwatch: [
    new WinstonCloudwatch({
      logGroupName: 'CarbonVoice-MCP-Server',
      logStreamName: `CarbonVoice-MCP-Server-${env.ENVIRONMENT}`,
      awsRegion: 'us-east-2',
      retentionInDays: 14,
      // Credentials are injected by App Runner
      level: getLogLevel(),
      jsonMessage: false, // Set to false to use messageFormatter
      messageFormatter: ({ level, message, ...rest }) => {
        return JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          message,
          environment: env.ENVIRONMENT,
          version: SERVICE_VERSION,
          ...rest,
        });
      },
    }),
  ],
};

// Note: Format is now defined inline in the logger creation

const getLogTransports = (): winston.transport[] => {
  const transport = env.LOG_TRANSPORT || 'file';

  console.error(
    'Executing: getLogTransports()',
    'transport:',
    transport,
    'logDir:',
    logDir,
  );

  if (transport === 'file') {
    createLogDir(logDir);

    return transports.file;
  }

  if (transport === 'cloudwatch') {
    return transports.cloudwatch;
  }

  return transports.console;
};

// Add colors to winston
winston.addColors(colors);

// Create the logger
export const logger = winston.createLogger({
  level: getLogLevel(),
  levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
      return JSON.stringify({
        timestamp,
        level,
        message,
        environment: env.ENVIRONMENT,
        version: SERVICE_VERSION,
        ...metadata,
      });
    }),
  ),
  transports: getLogTransports(),
});

// Add a startup log to verify the logger is working
// logger.debug('Logger initialized', {
//   currentLevel: getLogLevel(),
//   availableLevels: levels,
//   transports: logger.transports.map((t) => ({
//     level: t.level,
//   })),
//   logDir,
//   logFiles: {
//     error: errorLogFile,
//     combined: combinedLogFile,
//   },
// });

// Export a stream object for Morgan
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper to create child loggers with context
export const createLogger = (context: string) => {
  return logger.child({ context });
};
