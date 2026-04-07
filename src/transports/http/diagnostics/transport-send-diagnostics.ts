import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { logger } from '../../../utils';

type ToolCallContext = {
  toolName?: string;
  traceId?: string;
  userId?: string;
};

type DiagnosticsOptions = {
  enabled: boolean;
};

type TransportInternalState = {
  _requestToStreamMapping?: Map<number | string, string>;
  _requestResponseMap?: Map<number | string, unknown>;
  _streamMapping?: Map<string, unknown>;
};

/**
 * TEMPORARY INCIDENT INSTRUMENTATION
 *
 * Purpose:
 * - Debug production response stalls in Streamable HTTP transport send/flush path.
 *
 * Removal:
 * - Remove this helper after root cause is confirmed and mitigated.
 * - Keep disabled by default via MCP_TRANSPORT_DIAGNOSTICS_ENABLED=false.
 */
export const createTransportSendDiagnostics = ({
  enabled,
}: DiagnosticsOptions) => {
  const toolCallBySessionAndRequestId = new Map<
    string,
    Map<number | string, ToolCallContext>
  >();

  const getTransportInternalState = (transport: StreamableHTTPServerTransport) => {
    const internal = transport as unknown as TransportInternalState;

    return {
      requestToStreamSize: internal._requestToStreamMapping?.size,
      requestResponseSize: internal._requestResponseMap?.size,
      streamMappingSize: internal._streamMapping?.size,
    };
  };

  const attach = (transport: StreamableHTTPServerTransport): void => {
    if (!enabled) {
      return;
    }

    const transportWithPatchFlag = transport as StreamableHTTPServerTransport & {
      __cvSendDiagnosticsPatched?: boolean;
    };

    if (transportWithPatchFlag.__cvSendDiagnosticsPatched) {
      return;
    }

    const originalSend = transport.send.bind(transport);
    transport.send = (async (message: unknown, options?: unknown) => {
      const jsonRpcMessage = message as {
        id?: number | string;
        jsonrpc?: string;
        result?: unknown;
        error?: unknown;
      };
      const requestId = jsonRpcMessage?.id;
      const sessionId = transport.sessionId;
      const isJsonRpcResponse =
        jsonRpcMessage?.jsonrpc === '2.0' &&
        requestId !== undefined &&
        (Object.prototype.hasOwnProperty.call(jsonRpcMessage, 'result') ||
          Object.prototype.hasOwnProperty.call(jsonRpcMessage, 'error'));
      const toolContext =
        sessionId && requestId !== undefined
          ? toolCallBySessionAndRequestId.get(sessionId)?.get(requestId)
          : undefined;

      if (isJsonRpcResponse) {
        logger.info('MCP_TRANSPORT_SEND_START', {
          event: 'MCP_TRANSPORT_SEND_START',
          sessionId,
          requestId,
          traceId: toolContext?.traceId,
          toolName: toolContext?.toolName,
          userId: toolContext?.userId,
          hasError: Object.prototype.hasOwnProperty.call(jsonRpcMessage, 'error'),
          ...getTransportInternalState(transport),
        });
      }

      try {
        const sendResult = await originalSend(message as never, options as never);

        if (isJsonRpcResponse) {
          logger.info('MCP_TRANSPORT_SEND_DONE', {
            event: 'MCP_TRANSPORT_SEND_DONE',
            sessionId,
            requestId,
            traceId: toolContext?.traceId,
            toolName: toolContext?.toolName,
            userId: toolContext?.userId,
            ...getTransportInternalState(transport),
          });
        }

        if (sessionId && requestId !== undefined) {
          toolCallBySessionAndRequestId.get(sessionId)?.delete(requestId);
        }

        return sendResult;
      } catch (error) {
        logger.error('MCP_TRANSPORT_SEND_ERROR', {
          event: 'MCP_TRANSPORT_SEND_ERROR',
          sessionId,
          requestId,
          traceId: toolContext?.traceId,
          toolName: toolContext?.toolName,
          userId: toolContext?.userId,
          ...getTransportInternalState(transport),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }) as typeof transport.send;

    transportWithPatchFlag.__cvSendDiagnosticsPatched = true;
  };

  const trackToolCall = (
    sessionId: string,
    requestId: number | string | undefined,
    context: ToolCallContext,
  ): void => {
    if (!enabled || requestId === undefined) {
      return;
    }

    const perSessionRequests =
      toolCallBySessionAndRequestId.get(sessionId) ?? new Map();
    perSessionRequests.set(requestId, context);
    toolCallBySessionAndRequestId.set(sessionId, perSessionRequests);
  };

  const clearSession = (sessionId: string | undefined): void => {
    if (!enabled || !sessionId) {
      return;
    }
    toolCallBySessionAndRequestId.delete(sessionId);
  };

  return {
    attach,
    trackToolCall,
    clearSession,
  };
};
