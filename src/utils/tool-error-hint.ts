import { TOOL_DOCS } from '../docs/tool-docs';

/**
 * Attaches a recovery hint to an outgoing error payload.
 *
 * The axios layer (`handleAxiosError`) produces good, stable error codes but
 * has no idea which tool it was serving, so it cannot say what to do next.
 * The tool does know, and `TOOL_DOCS[tool].commonErrors` already carries that
 * text for the description — this reuses it at failure time so the two can
 * never drift apart.
 *
 * "invalid prompt_id — call `list_ai_actions` to get valid values" resolves in
 * one step; a bare 400 costs several.
 */

interface ErrorEnvelope {
  statusCode?: number;
  body?: {
    error?: { code?: string; message?: string; next_action?: string };
  };
}

const readErrorCode = (error: unknown): string | undefined => {
  const envelope = error as ErrorEnvelope;
  return typeof envelope?.body?.error?.code === 'string'
    ? envelope.body.error.code
    : undefined;
};

export const withToolErrorHint = (error: unknown, tool?: string): unknown => {
  if (!tool) {
    return error;
  }

  const code = readErrorCode(error);
  if (!code) {
    // A bare Error (or anything without our envelope) has nowhere to put a
    // hint without inventing a shape the caller does not expect.
    return error;
  }

  const hint = TOOL_DOCS[tool]?.commonErrors?.find((e) => e.code === code);
  if (!hint) {
    return error;
  }

  const envelope = error as ErrorEnvelope;
  return {
    ...envelope,
    body: {
      ...envelope.body,
      error: {
        ...envelope.body?.error,
        next_action: hint.nextAction,
      },
    },
  };
};
