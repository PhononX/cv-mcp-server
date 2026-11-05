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

/**
 * Most rows one fan-out call returns across all workspaces (STT-07), so 20
 * workspaces x `limit` 50 cannot put 1,000 `matched_chunk`s into one tool
 * result. Applied AFTER the searches, on scores: splitting it up front gave
 * every workspace `floor(100 / n)` rows, so 29 workspaces (26 of them empty)
 * cut the only one with hits to 3. Each group keeps its best row, so no
 * workspace disappears; past 100 groups the total is one row per group.
 */
export const FAN_OUT_MAX_TOTAL_ROWS = 100;

export interface FanOutDeps {
  listWorkspaces: () => Promise<{ id: string; name: string }[]>;
  search: (body: TranscriptSearchBody) => Promise<TranscriptSearchResponse>;
}

/** A V8 stack frame line (`    at fn (file.js:12:3)`), never a message line. */
const STACK_FRAME = /^\s+at .*:\d+:\d+\)?$/;

/**
 * HTTP status and code of a thrown `handleAxiosError` envelope. Never the
 * message or details: a cv-api 400 echoes the query back in them (STT-26).
 *
 * A plain `Error` with no envelope is a bug in this process (the mutator
 * wraps every request failure in an envelope). Its name and stack FRAMES are
 * kept so it can be debugged; its message is not, since nothing guarantees
 * it never quotes a value (the first stack line repeats it, so it is cut).
 */
export function describeFailure(error: unknown): {
  status?: number;
  code: string;
  errorName?: string;
  stackFrames?: string;
} {
  const envelope = error as {
    statusCode?: unknown;
    body?: { error?: { code?: unknown } };
  } | null;
  const code = envelope?.body?.error?.code;
  if (typeof code !== 'string') {
    return error instanceof Error
      ? {
          code: 'UNKNOWN_ERROR',
          errorName: error.name,
          stackFrames: error.stack
            ?.split('\n')
            .filter((line) => STACK_FRAME.test(line))
            .join('\n'),
        }
      : { code: 'UNKNOWN_ERROR' };
  }
  const status = envelope?.statusCode;
  return typeof status === 'number' && status > 0 ? { status, code } : { code };
}

/**
 * The envelope thrown for a 200 whose body is not the expected shape (cv-api
 * version skew, a proxy page), so it is handled like any other API failure
 * rather than surfacing as a TypeError.
 */
export const unexpectedResponseError = (what: string) => ({
  statusCode: 0,
  body: {
    error: {
      code: 'UNKNOWN_ERROR',
      message: `Unexpected ${what} response from the API`,
    },
  },
});

/** A search 200 without a `results` array fails only its own workspace. */
const assertSearchResponse = (
  response: TranscriptSearchResponse,
): TranscriptSearchResponse => {
  if (Array.isArray(response?.results)) return response;
  throw unexpectedResponseError('search');
};

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
    workspaces.map((w) =>
      deps
        .search({ ...args, workspace_id: w.id, limit })
        .then(assertSearchResponse),
    ),
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

  capTotalRows(groups);
  groups.sort((a, b) => b.best_score - a.best_score); // STT-10
  return {
    needs_workspace_choice: groups.length >= 2, // STT-11
    workspaces: groups,
    empty_workspaces: empty,
    skipped_workspaces: skipped,
  };
}

/**
 * Trims `groups` in place to `FAN_OUT_MAX_TOTAL_ROWS` rows, dropping the
 * lowest scores across all groups first. Each group's best row is never
 * dropped, so `best_score` holds and every group stays listed.
 */
function capTotalRows(groups: TranscriptSearchGroup[]): void {
  const total = groups.reduce((n, g) => n + g.results.length, 0);
  if (total <= FAN_OUT_MAX_TOTAL_ROWS) return;

  const best = new Set(
    groups.map((g) =>
      g.results.reduce((top, r) => (r.score > top.score ? r : top)),
    ),
  );
  const keep = new Set(
    groups
      .flatMap((g) => g.results.filter((r) => !best.has(r)))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, FAN_OUT_MAX_TOTAL_ROWS - groups.length)),
  );
  for (const g of groups) {
    g.results = g.results.filter((r) => best.has(r) || keep.has(r));
    g.result_count = g.results.length;
  }
}
