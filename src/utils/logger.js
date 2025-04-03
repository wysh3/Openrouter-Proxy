import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = 'logs';

// Configure transports
const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
  new winston.transports.DailyRotateFile({
    filename: path.join(logsDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports
});

// Key-specific logger
export const logKeyEvent = (event, meta = {}) => {
  logger.info(event, { ...meta, type: 'key_event' });
};

// Error logger
export const logError = (error, context = {}) => {
  logger.error(error.message, { 
    stack: error.stack,
    ...context,
    type: 'error' 
  });
};

export default logger;