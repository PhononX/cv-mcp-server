import { SessionMetrics } from './session.types';

import { logger } from '../../../utils';

export class SessionLogger {
  logSessionCreated(sessionId: string, userId: string): void {
    logger.info('🆕 Session created', {
      sessionId,
      userId,
      event: 'SESSION_CREATED',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionDestroyed(
    sessionId: string,
    duration: number,
    metrics: SessionMetrics,
  ): void {
    logger.info('🗑️ Session destroyed', {
      sessionId,
      duration,
      metrics,
      event: 'SESSION_DESTROYED',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionTimeout(sessionId: string): void {
    logger.info('⏰ Session timeout triggered', {
      sessionId,
      event: 'SESSION_TIMEOUT',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionReused(
    sessionId: string,
    userId: string,
    totalInteractions: number,
  ): void {
    logger.debug('🔄 Session reused', {
      sessionId,
      userId,
      totalInteractions,
      event: 'SESSION_REUSED',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionError(
    sessionId: string,
    error: Error,
    context?: Record<string, unknown>,
  ): void {
    logger.error('❌ Session error', {
      sessionId,
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

  logSessionDebug(
    sessionId: string,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    logger.debug('🔍 Session debug', {
      sessionId,
      message,
      context,
      event: 'SESSION_DEBUG',
      timestamp: new Date().toISOString(),
    });
  }

  logSessionMetrics(sessionId: string, metrics: SessionMetrics): void {
    logger.debug('📊 Session metrics', {
      sessionId,
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
