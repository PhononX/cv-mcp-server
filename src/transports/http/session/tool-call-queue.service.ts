export const TOOL_CALL_QUEUE_TIMEOUT_ERROR = 'TOOL_CALL_QUEUE_TIMEOUT';

export class ToolCallQueueTimeoutError extends Error {
  constructor(message = TOOL_CALL_QUEUE_TIMEOUT_ERROR) {
    super(message);
    this.name = 'ToolCallQueueTimeoutError';
  }
}

export type ToolCallQueueLease = {
  waitDurationMs: number;
  release: () => void;
};

/**
 * Serializes tool calls per session ID.
 * Each acquired lease must be released exactly once.
 */
export class ToolCallQueueService {
  private queueBySessionId = new Map<string, Promise<void>>();

  async acquire(
    sessionId: string,
    waitTimeoutMs: number,
  ): Promise<ToolCallQueueLease> {
    const previousQueueHead =
      this.queueBySessionId.get(sessionId) ?? Promise.resolve();

    let releaseCurrentSlot!: () => void;
    const currentSlotPromise = new Promise<void>((resolve) => {
      releaseCurrentSlot = resolve;
    });

    const nextQueueHead = previousQueueHead
      .catch(() => undefined)
      .then(() => currentSlotPromise);
    this.queueBySessionId.set(sessionId, nextQueueHead);

    const waitStartedAtMs = Date.now();
    let timeoutHandle: NodeJS.Timeout | undefined;

    const queueTimeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new ToolCallQueueTimeoutError());
      }, waitTimeoutMs);
    });

    try {
      await Promise.race([previousQueueHead, queueTimeout]);
      return {
        waitDurationMs: Date.now() - waitStartedAtMs,
        release: () => {
          releaseCurrentSlot();
          if (this.queueBySessionId.get(sessionId) === nextQueueHead) {
            this.queueBySessionId.delete(sessionId);
          }
        },
      };
    } catch (error) {
      // Ensure timed-out request does not leave a blocked slot behind.
      releaseCurrentSlot();
      if (this.queueBySessionId.get(sessionId) === nextQueueHead) {
        this.queueBySessionId.delete(sessionId);
      }
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  clearSession(sessionId: string): void {
    if (!sessionId) {
      return;
    }
    this.queueBySessionId.delete(sessionId);
  }
}

export const toolCallQueueService = new ToolCallQueueService();
