import { SessionMetrics } from './session.types';

import { logger } from '../../../utils';

export class SessionLogger {
  logSessionCreated(): void {
    logger.info('🆕 Session created', {
      event: 'SESSION_CREATED',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionDestroyed(duration: number, metrics: SessionMetrics): void {
    logger.info('🗑️ Session destroyed', {
      duration,
      metrics,
      event: 'SESSION_DESTROYED',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionTimeout(): void {
    logger.info('⏰ Session timeout triggered', {
      event: 'SESSION_TIMEOUT',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionReused(totalInteractions: number): void {
    logger.debug('🔄 Session reused', {
      totalInteractions,
      event: 'SESSION_REUSED',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionError(error: Error, context?: Record<string, unknown>): void {
    logger.error('❌ Session error', {
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      context,
      event: 'SESSION_ERROR',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionDebug(message: string, context?: Record<string, unknown>): void {
    logger.debug('🔍 Session debug', {
      message,
      context,
      event: 'SESSION_DEBUG',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionMetrics(metrics: SessionMetrics): void {
    logger.debug('📊 Session metrics', {
      metrics,
      event: 'SESSION_METRICS',
      timestamp: new Date().toISOString(),
    });
  }

  logCleanupStarted(totalSessions: number): void {
    logger.info('🧹 Session cleanup started', {
      totalSessions,
      event: 'SESSION_CLEANUP_STARTED',
      timestamp: new Date().toISOString(),
    });
  }

  logCleanupCompleted(
    cleanedSessions: number,
    remainingSessions: number,
  ): void {
    logger.info('✨ Session cleanup completed', {
      cleanedSessions,
      remainingSessions,
      event: 'SESSION_CLEANUP_COMPLETED',
      timestamp: new Date().toISOString(),
    });
  }
}
