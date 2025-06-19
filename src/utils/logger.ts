import fs from 'fs';
import path from 'path';

import winston from 'winston';

import { env } from '../config';
import { LOG_DIR } from '../constants';

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

// Add colors to winston
winston.addColors(colors);

// Console format with colors
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:SSS' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let output = `${timestamp} ${level}: ${message}`;
    if (Object.keys(metadata).length > 0) {
      output += '\n' + JSON.stringify(metadata, null, 2);
    }
    return output;
  }),
);

// File format (JSON)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:SSS' }),
  winston.format.json(),
);

const getLogLevel = () => {
  return env.LOG_LEVEL || 'info';
};

// Create file transports
// const logDir = path.join(process.cwd(), 'logs');

// Prefer env var, fallback to project-relative folder
const logDir = process.env.LOG_DIR || LOG_DIR;

if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    console.error('Error creating log directory', error);
  }
}
console.error('logs_dir', logDir);

// Create log files
const errorLogFile = path.join(logDir, 'error.log');
const combinedLogFile = path.join(logDir, 'combined.log');

const fileTransports = [
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
];

const consoleTransport =
  process.env.MCP_STDIO_MODE === 'true'
    ? [
        new winston.transports.Console({
          format: consoleFormat,
        }),
      ]
    : [];

// Create the logger
export const logger = winston.createLogger({
  level: getLogLevel(),
  levels,
  format: fileFormat,
  transports: [...consoleTransport, ...fileTransports],
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
