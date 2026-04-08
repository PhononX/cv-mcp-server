import { SessionMetrics } from './session.types';

import { env } from '../../../config';
import { logger } from '../../../utils';

export class SessionLogger {
  private get enabled(): boolean {
    return env.MCP_SESSION_LOGS_ENABLED;
  }

  logSessionCreated(): void {
    if (!this.enabled) return;
    logger.info('🆕 Session created', {
      event: 'SESSION_CREATED',
    });
  }

  logSessionDestroyed(duration: number, metrics: SessionMetrics): void {
    if (!this.enabled) return;
    logger.info('🗑️ Session destroyed', {
      duration,
      metrics,
      event: 'SESSION_DESTROYED',
    });
  }

  logSessionTimeout(): void {
    if (!this.enabled) return;
    logger.info('⏰ Session timeout triggered', {
      event: 'SESSION_TIMEOUT',
    });
  }

  logSessionReused(totalInteractions: number): void {
    if (!this.enabled) return;
    logger.debug('🔄 Session reused', {
      totalInteractions,
      event: 'SESSION_REUSED',
    });
  }

  logSessionError(error: Error, context?: Record<string, unknown>): void {
    if (!this.enabled) return;
    logger.error('❌ Session error', {
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      context,
      event: 'SESSION_ERROR',
    });
  }

  logSessionDebug(message: string, context?: Record<string, unknown>): void {
    if (!this.enabled) return;
    logger.debug('🔍 Session debug', {
      message,
      context,
      event: 'SESSION_DEBUG',
    });
  }

  logSessionMetrics(metrics: SessionMetrics): void {
    if (!this.enabled) return;
    logger.debug('📊 Session metrics', {
      metrics,
      event: 'SESSION_METRICS',
    });
  }

  logCleanupStarted(totalSessions: number): void {
    if (!this.enabled) return;
    logger.info('🧹 Session cleanup started', {
      totalSessions,
      event: 'SESSION_CLEANUP_STARTED',
    });
  }

  logCleanupCompleted(
    cleanedSessions: number,
    remainingSessions: number,
  ): void {
    if (!this.enabled) return;
    logger.info('✨ Session cleanup completed', {
      cleanedSessions,
      remainingSessions,
      event: 'SESSION_CLEANUP_COMPLETED',
    });
  }
}
