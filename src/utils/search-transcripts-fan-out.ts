// `src/cv-api.ts` imports `./utils`, so the API calls are injected
// (`FanOutDeps`) instead of imported, and the logger comes from `./logger`,
// not the barrel.
import { logger } from './logger';

import {
  TranscriptSearchBody,
  TranscriptSearchFanOutResponse,
  TranscriptSearchGroup,
  TranscriptSearchResponse,
} from '../interfaces';
import { SearchTranscriptsParams } from '../schemas';

/** Rows per workspace when the agent gave no `limit` (STT-07). */
export const FAN_OUT_DEFAULT_LIMIT = 10;

export interface FanOutDeps {
  listWorkspaces: () => Promise<{ id: string; name: string }[]>;
  search: (body: TranscriptSearchBody) => Promise<TranscriptSearchResponse>;
}

/**
 * HTTP status and code of a thrown `handleAxiosError` envelope. Never the
 * message or details: a cv-api 400 echoes the query back in them (STT-26).
 */
export function describeFailure(error: unknown): {
  status?: number;
  code: string;
} {
  const envelope = error as {
    statusCode?: unknown;
    body?: { error?: { code?: unknown } };
  } | null;
  const code = envelope?.body?.error?.code;
  if (typeof code !== 'string') return { code: 'UNKNOWN_ERROR' };
  const status = envelope?.statusCode;
  return typeof status === 'number' && status > 0 ? { status, code } : { code };
}

const isForbidden = (error: unknown) =>
  (error as { statusCode?: unknown } | null)?.statusCode === 403;

/**
 * `search_transcripts` without `workspace_id`: one search per workspace the
 * caller belongs to, all in flight at once, grouped by workspace.
 *
 * Resolves the grouped response, or rejects with the original error object
 * of the basic-info call (STT-08) or of the chosen failed search (STT-16).
 */
export async function searchTranscriptsInAllWorkspaces(
  args: Omit<SearchTranscriptsParams, 'workspace_id'>,
  deps: FanOutDeps,
): Promise<TranscriptSearchFanOutResponse> {
  const workspaces = await deps.listWorkspaces();
  const limit = args.limit ?? FAN_OUT_DEFAULT_LIMIT;
  // `map` starts every call before any is awaited (STT-06).
  const settled = await Promise.allSettled(
    workspaces.map((w) => deps.search({ ...args, workspace_id: w.id, limit })),
  );

  const groups: TranscriptSearchGroup[] = [];
  const empty: TranscriptSearchFanOutResponse['empty_workspaces'] = [];
  const skipped: TranscriptSearchFanOutResponse['skipped_workspaces'] = [];
  const failures: { workspace_id: string; status?: number; code: string }[] =
    [];
  const nonForbiddenErrors: unknown[] = [];
  let forbidden = 0;

  settled.forEach((entry, i) => {
    const { id: workspace_id, name: workspace_name } = workspaces[i];
    if (entry.status === 'fulfilled') {
      const { results, scope_capped } = entry.value;
      if (results.length === 0) {
        empty.push({ workspace_id, workspace_name });
        return;
      }
      groups.push({
        workspace_id,
        workspace_name,
        result_count: results.length,
        best_score: Math.max(...results.map((r) => r.score)),
        scope_capped,
        results,
      });
      return;
    }
    const failure = describeFailure(entry.reason);
    failures.push({ workspace_id, ...failure });
    if (isForbidden(entry.reason)) {
      forbidden += 1; // STT-14: in no list
      return;
    }
    nonForbiddenErrors.push(entry.reason);
    skipped.push({ workspace_id, workspace_name, reason: failure.code });
  });

  if (failures.length > 0) {
    // STT-27. The personal-workspace 403 is expected on many calls: info only.
    logger[skipped.length > 0 ? 'warn' : 'info']('SEARCH_TRANSCRIPTS_FAN_OUT', {
      event: 'SEARCH_TRANSCRIPTS_FAN_OUT',
      tool: 'search_transcripts',
      listed: workspaces.length,
      succeeded: groups.length + empty.length,
      forbidden,
      skipped: skipped.length,
      failures,
    });
  }

  // STT-16: nothing succeeded and something other than a 403 failed.
  if (groups.length + empty.length === 0 && nonForbiddenErrors.length > 0) {
    throw (
      nonForbiddenErrors.find(
        (e) => describeFailure(e).code === 'RATE_LIMITED',
      ) ?? nonForbiddenErrors[0]
    );
  }

  groups.sort((a, b) => b.best_score - a.best_score); // STT-10
  return {
    needs_workspace_choice: groups.length >= 2, // STT-11
    workspaces: groups,
    empty_workspaces: empty,
    skipped_workspaces: skipped,
  };
}
