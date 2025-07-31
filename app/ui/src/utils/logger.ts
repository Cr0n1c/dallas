// Structured logging utility for UI components
interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  component: string;
  message: string;
  context?: LogContext;
  userAgent?: string;
  url?: string;
}

// Log level hierarchy (from lowest to highest)
type LogLevel = 'debug' | 'info' | 'warning' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 1,
  info: 2,
  warning: 3,
  error: 4,
};

// Get minimum log level from environment variable
const getMinLogLevel = (): LogLevel => {
  const envLogLevel = process.env.LOG_LEVEL?.toLowerCase();

  if (envLogLevel && LOG_LEVELS[envLogLevel as LogLevel] !== undefined) {
    return envLogLevel as LogLevel;
  }

  // Default to 'info' if LOG_LEVEL is not set or invalid
  return 'info';
};

const MIN_LOG_LEVEL = getMinLogLevel();

class UILogger {
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
  }

  private formatLog(level: LogEntry['level'], message: string, context?: LogContext): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    };
  }

  private log(level: LogEntry['level'], message: string, context?: LogContext): void {
    // Check if this log level should be output based on configuration
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.formatLog(level, message, context);

    // Only output structured logs with a consistent prefix
    // This allows easy filtering in browser console and log aggregation tools
    // Format: STRUCTURED_LOG: {"timestamp": "...", "level": "...", "component": "...", ...}
    console.log('STRUCTURED_LOG:', JSON.stringify(logEntry));
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warning(message: string, context?: LogContext): void {
    this.log('warning', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  // Method to get current log level configuration
  getLogLevel(): LogLevel {
    return MIN_LOG_LEVEL;
  }
}

// Create logger instances for different components
export const createLogger = (component: string): UILogger => {
  return new UILogger(component);
};

// Pre-configured loggers for common components
export const kubernetesLogger = createLogger('kubernetes');
export const networkLogger = createLogger('network');
export const infrastructureLogger = createLogger('infrastructure');
export const appLogger = createLogger('app');

// Utility function to log API calls
export const logApiCall = (
  logger: UILogger,
  method: string,
  url: string,
  startTime: number,
  success: boolean,
  statusCode?: number,
  error?: string,
  additionalContext?: LogContext
): void => {
  const duration = Date.now() - startTime;
  const context: LogContext = {
    method,
    url,
    duration_ms: duration,
    success,
    ...additionalContext,
  };

  if (statusCode) {
    context.status_code = statusCode;
  }

  if (error) {
    context.error = error;
  }

  if (success) {
    logger.info(`${method} ${url} completed`, context);
  } else {
    logger.error(`${method} ${url} failed`, context);
  }
};

// Utility function to log user actions
export const logUserAction = (
  logger: UILogger,
  action: string,
  details?: LogContext
): void => {
  logger.info(`User action: ${action}`, details);
};

// Utility function to log component lifecycle events
export const logComponentEvent = (
  logger: UILogger,
  event: string,
  details?: LogContext
): void => {
  logger.debug(`Component event: ${event}`, details);
};

// Export the current log level for debugging purposes
export const getCurrentLogLevel = (): LogLevel => MIN_LOG_LEVEL;
