/**
 * STT-06..17 + STT-27 (fan-out summary line): `search_transcripts` without a
 * `workspace_id` searches every workspace `basic-info` lists and groups the
 * hits. Driven with plain fakes for the two injected API calls; errors are
 * the `handleAxiosError` envelopes the real `mutator` throws.
 */
import {
  TranscriptSearchBody,
  TranscriptSearchResponse,
  TranscriptSearchResult,
} from '../../../src/interfaces';
import { logger } from '../../../src/utils/logger';
import {
  describeFailure,
  FanOutDeps,
  searchTranscriptsInAllWorkspaces,
} from '../../../src/utils/search-transcripts-fan-out';

const envelope = (statusCode: number, code: string) => ({
  statusCode,
  body: {
    error: {
      code,
      message: `message for ${code}`,
      details: { data: { value: 'echoed input' } },
    },
    traceId: 'trace-1',
  },
});
const FORBIDDEN = () => envelope(403, 'FORBIDDEN');
const RATE_LIMITED = () => envelope(429, 'RATE_LIMITED');
const SERVER_ERROR = (status = 503) => envelope(status, 'SERVER_ERROR');
const NETWORK_ERROR = () => envelope(0, 'NETWORK_ERROR');

const row = (
  message_id: string,
  score: number,
  workspace_id: string,
): TranscriptSearchResult => ({
  message_id,
  conversation_id: 'c-1',
  conversation_name: 'General',
  workspace_id,
  creator_id: 'u-1',
  creator_name: 'Ann',
  created_at: '2026-10-01T10:00:00Z',
  parent_message_id: null,
  score,
  matched_chunk: `chunk of ${message_id}`,
});

const WS = {
  A: { id: 'ws-a', name: 'Alpha' },
  B: { id: 'ws-b', name: 'Beta' },
  C: { id: 'ws-c', name: 'Gamma' },
  P: { id: 'personal', name: 'Personal' },
};

type Outcome = { ok: TranscriptSearchResponse } | { fail: unknown };

/** Fakes keyed by workspace id: each search resolves or rejects as given. */
const makeDeps = (
  workspaces: { id: string; name: string }[],
  outcomes: Record<string, Outcome>,
) => {
  const search = jest.fn(async (body: TranscriptSearchBody) => {
    const outcome = outcomes[body.workspace_id];
    if ('fail' in outcome) throw outcome.fail;
    return outcome.ok;
  });
  const listWorkspaces = jest.fn(async () => workspaces);
  return { listWorkspaces, search } satisfies FanOutDeps;
};

const args = { query: 'launch date decision' };

const A_RESPONSE = {
  results: [row('a-1', 0.5, WS.A.id), row('a-2', 0.7, WS.A.id)],
  scope_capped: true,
};
const B_RESPONSE = { results: [row('b-1', 0.9, WS.B.id)], scope_capped: false };
const EMPTY = { results: [], scope_capped: false };

describe('searchTranscriptsInAllWorkspaces', () => {
  let warn: jest.SpyInstance;
  let info: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(logger, 'warn');
    info = jest.spyOn(logger, 'info');
  });

  describe("spec's Independent Test (A 2 rows, B 1, C 0, personal 403)", () => {
    const workspaces = [WS.A, WS.B, WS.C, WS.P];

    it('groups A and B by best_score, lists C as empty, leaves personal out (STT-09..12, STT-14)', async () => {
      const deps = makeDeps(workspaces, {
        [WS.A.id]: { ok: A_RESPONSE },
        [WS.B.id]: { ok: B_RESPONSE },
        [WS.C.id]: { ok: EMPTY },
        [WS.P.id]: { fail: FORBIDDEN() },
      });

      const result = await searchTranscriptsInAllWorkspaces(args, deps);

      expect(deps.listWorkspaces).toHaveBeenCalledTimes(1);
      expect(deps.search).toHaveBeenCalledTimes(4);
      expect(result).toEqual({
        needs_workspace_choice: true,
        workspaces: [
          {
            workspace_id: WS.B.id,
            workspace_name: WS.B.name,
            result_count: 1,
            best_score: 0.9,
            scope_capped: false,
            results: B_RESPONSE.results,
          },
          {
            workspace_id: WS.A.id,
            workspace_name: WS.A.name,
            result_count: 2,
            best_score: 0.7,
            scope_capped: true,
            results: A_RESPONSE.results,
          },
        ],
        empty_workspaces: [
          { workspace_id: WS.C.id, workspace_name: WS.C.name },
        ],
        skipped_workspaces: [],
      });
      expect(JSON.stringify(result)).not.toContain(WS.P.id);
    });

    it('moves B to skipped_workspaces with RATE_LIMITED when it answers 429 (STT-15)', async () => {
      const deps = makeDeps(workspaces, {
        [WS.A.id]: { ok: A_RESPONSE },
        [WS.B.id]: { fail: RATE_LIMITED() },
        [WS.C.id]: { ok: EMPTY },
        [WS.P.id]: { fail: FORBIDDEN() },
      });

      const result = await searchTranscriptsInAllWorkspaces(args, deps);

      expect(result.needs_workspace_choice).toBe(false);
      expect(result.workspaces.map((g) => g.workspace_id)).toEqual([WS.A.id]);
      expect(result.empty_workspaces).toEqual([
        { workspace_id: WS.C.id, workspace_name: WS.C.name },
      ]);
      expect(result.skipped_workspaces).toEqual([
        {
          workspace_id: WS.B.id,
          workspace_name: WS.B.name,
          reason: 'RATE_LIMITED',
        },
      ]);
      expect(JSON.stringify(result)).not.toContain(WS.P.id);
    });
  });

  describe('calls (STT-06, STT-07)', () => {
    it('starts every search before the first one resolves', async () => {
      const resolvers: (() => void)[] = [];
      const deps: FanOutDeps = {
        listWorkspaces: jest.fn(async () => [WS.A, WS.B, WS.C, WS.P]),
        search: jest.fn(
          () =>
            new Promise<TranscriptSearchResponse>((resolve) => {
              resolvers.push(() => resolve(EMPTY));
            }),
        ),
      };

      const pending = searchTranscriptsInAllWorkspaces(args, deps);
      await new Promise((r) => setImmediate(r));

      // No search has resolved yet, and all four are already in flight.
      expect(deps.search).toHaveBeenCalledTimes(4);
      resolvers.forEach((resolve) => resolve());
      await expect(pending).resolves.toEqual({
        needs_workspace_choice: false,
        workspaces: [],
        empty_workspaces: [WS.A, WS.B, WS.C, WS.P].map((w) => ({
          workspace_id: w.id,
          workspace_name: w.name,
        })),
        skipped_workspaces: [],
      });
    });

    const allEmpty = {
      [WS.A.id]: { ok: EMPTY },
      [WS.B.id]: { ok: EMPTY },
      [WS.P.id]: { ok: EMPTY },
    };
    const fullArgs = {
      query: 'launch date decision',
      conversation_ids: ['c-1'],
      creator_ids: ['u-1'],
      exclude_message_ids: ['m-1', 'm-2'],
      start_date: '2026-10-01T00:00:00Z',
      end_date: '2026-11-01T00:00:00-03:00',
    };

    it('sends each workspace id with the same other args and limit 10 by default', async () => {
      const deps = makeDeps([WS.A, WS.B, WS.P], allEmpty);

      await searchTranscriptsInAllWorkspaces(fullArgs, deps);

      expect(deps.search.mock.calls.map(([body]) => body)).toEqual([
        { ...fullArgs, workspace_id: WS.A.id, limit: 10 },
        { ...fullArgs, workspace_id: WS.B.id, limit: 10 },
        { ...fullArgs, workspace_id: WS.P.id, limit: 10 },
      ]);
    });

    it('sends the given limit to every workspace', async () => {
      const deps = makeDeps([WS.A, WS.B, WS.P], allEmpty);

      await searchTranscriptsInAllWorkspaces({ ...fullArgs, limit: 25 }, deps);

      expect(deps.search.mock.calls.map(([body]) => body.limit)).toEqual([
        25, 25, 25,
      ]);
    });
  });

  describe('basic-info failure (STT-08)', () => {
    it('rethrows the same error object and searches nothing', async () => {
      const error = SERVER_ERROR();
      const deps = makeDeps([], {});
      deps.listWorkspaces.mockRejectedValueOnce(error);

      await expect(searchTranscriptsInAllWorkspaces(args, deps)).rejects.toBe(
        error,
      );
      expect(deps.search).not.toHaveBeenCalled();
    });
  });

  describe('needs_workspace_choice (STT-11)', () => {
    it.each([
      ['0 groups', [EMPTY, EMPTY], false],
      ['1 group', [B_RESPONSE, EMPTY], false],
      ['2 groups', [B_RESPONSE, A_RESPONSE], true],
    ])('%s → %s', async (_label, [first, second], expected) => {
      const deps = makeDeps([WS.A, WS.B], {
        [WS.A.id]: { ok: first },
        [WS.B.id]: { ok: second },
      });

      const result = await searchTranscriptsInAllWorkspaces(args, deps);

      expect(result.needs_workspace_choice).toBe(expected);
    });
  });

  describe('skipped reasons (STT-15)', () => {
    it.each([
      ['429', RATE_LIMITED(), 'RATE_LIMITED'],
      ['503', SERVER_ERROR(), 'SERVER_ERROR'],
      ['no response', NETWORK_ERROR(), 'NETWORK_ERROR'],
      ['a non-envelope throw', new Error('boom'), 'UNKNOWN_ERROR'],
    ])('%s → %s, A still returned', async (_label, failure, reason) => {
      const deps = makeDeps([WS.A, WS.B], {
        [WS.A.id]: { ok: A_RESPONSE },
        [WS.B.id]: { fail: failure },
      });

      const result = await searchTranscriptsInAllWorkspaces(args, deps);

      expect(result.workspaces.map((g) => g.workspace_id)).toEqual([WS.A.id]);
      expect(result.skipped_workspaces).toEqual([
        { workspace_id: WS.B.id, workspace_name: WS.B.name, reason },
      ]);
    });
  });

  describe('whole-call outcome when no search succeeds (STT-16, STT-17)', () => {
    it('[503, 429] rejects with the 429 error object', async () => {
      const rateLimited = RATE_LIMITED();
      const deps = makeDeps([WS.A, WS.B], {
        [WS.A.id]: { fail: SERVER_ERROR() },
        [WS.B.id]: { fail: rateLimited },
      });

      await expect(searchTranscriptsInAllWorkspaces(args, deps)).rejects.toBe(
        rateLimited,
      );
    });

    it('[403, 503, 500] rejects with the first non-403 error object (the 503)', async () => {
      const first = SERVER_ERROR(503);
      const deps = makeDeps([WS.P, WS.A, WS.B], {
        [WS.P.id]: { fail: FORBIDDEN() },
        [WS.A.id]: { fail: first },
        [WS.B.id]: { fail: SERVER_ERROR(500) },
      });

      await expect(searchTranscriptsInAllWorkspaces(args, deps)).rejects.toBe(
        first,
      );
    });

    const emptyResponse = {
      needs_workspace_choice: false,
      workspaces: [],
      empty_workspaces: [],
      skipped_workspaces: [],
    };

    it('every search 403 → resolves with all lists empty', async () => {
      const deps = makeDeps([WS.A, WS.P], {
        [WS.A.id]: { fail: FORBIDDEN() },
        [WS.P.id]: { fail: FORBIDDEN() },
      });

      await expect(
        searchTranscriptsInAllWorkspaces(args, deps),
      ).resolves.toEqual(emptyResponse);
    });

    it('basic-info [] → resolves with all lists empty and searches nothing', async () => {
      const deps = makeDeps([], {});

      await expect(
        searchTranscriptsInAllWorkspaces(args, deps),
      ).resolves.toEqual(emptyResponse);
      expect(deps.search).not.toHaveBeenCalled();
    });
  });

  describe('SEARCH_TRANSCRIPTS_FAN_OUT summary line (STT-27)', () => {
    const summaryCalls = (spy: jest.SpyInstance) =>
      spy.mock.calls.filter(
        ([message]) => message === 'SEARCH_TRANSCRIPTS_FAN_OUT',
      );

    it('is written once at warn with counts and metadata-only failures when a workspace is skipped', async () => {
      const deps = makeDeps([WS.A, WS.B, WS.C, WS.P], {
        [WS.A.id]: { ok: A_RESPONSE },
        [WS.B.id]: { fail: RATE_LIMITED() },
        [WS.C.id]: { fail: NETWORK_ERROR() },
        [WS.P.id]: { fail: FORBIDDEN() },
      });

      await searchTranscriptsInAllWorkspaces(args, deps);

      expect(summaryCalls(info)).toHaveLength(0);
      expect(summaryCalls(warn)).toEqual([
        [
          'SEARCH_TRANSCRIPTS_FAN_OUT',
          {
            event: 'SEARCH_TRANSCRIPTS_FAN_OUT',
            tool: 'search_transcripts',
            listed: 4,
            succeeded: 1,
            forbidden: 1,
            skipped: 2,
            failures: [
              { workspace_id: WS.B.id, status: 429, code: 'RATE_LIMITED' },
              { workspace_id: WS.C.id, code: 'NETWORK_ERROR' },
              { workspace_id: WS.P.id, status: 403, code: 'FORBIDDEN' },
            ],
          },
        ],
      ]);
    });

    it('is written at warn before a whole-call rejection', async () => {
      const deps = makeDeps([WS.A], { [WS.A.id]: { fail: SERVER_ERROR() } });

      await expect(
        searchTranscriptsInAllWorkspaces(args, deps),
      ).rejects.toBeDefined();

      expect(summaryCalls(warn)).toHaveLength(1);
      expect(summaryCalls(warn)[0][1]).toMatchObject({
        listed: 1,
        succeeded: 0,
        forbidden: 0,
        skipped: 1,
      });
    });

    it('is written at info when every failure was a 403', async () => {
      const deps = makeDeps([WS.A, WS.P], {
        [WS.A.id]: { ok: A_RESPONSE },
        [WS.P.id]: { fail: FORBIDDEN() },
      });

      await searchTranscriptsInAllWorkspaces(args, deps);

      expect(summaryCalls(warn)).toHaveLength(0);
      expect(summaryCalls(info)).toEqual([
        [
          'SEARCH_TRANSCRIPTS_FAN_OUT',
          {
            event: 'SEARCH_TRANSCRIPTS_FAN_OUT',
            tool: 'search_transcripts',
            listed: 2,
            succeeded: 1,
            forbidden: 1,
            skipped: 0,
            failures: [
              { workspace_id: WS.P.id, status: 403, code: 'FORBIDDEN' },
            ],
          },
        ],
      ]);
    });

    it('is not written when no search rejects', async () => {
      const deps = makeDeps([WS.A, WS.C], {
        [WS.A.id]: { ok: A_RESPONSE },
        [WS.C.id]: { ok: EMPTY },
      });

      await searchTranscriptsInAllWorkspaces(args, deps);

      expect(summaryCalls(warn)).toHaveLength(0);
      expect(summaryCalls(info)).toHaveLength(0);
    });
  });
});

describe('describeFailure', () => {
  it('returns only status and code of an envelope (no message, no details)', () => {
    expect(describeFailure(envelope(400, 'BAD_REQUEST'))).toStrictEqual({
      status: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('returns only the code when there was no response', () => {
    expect(describeFailure(NETWORK_ERROR())).toStrictEqual({
      code: 'NETWORK_ERROR',
    });
  });

  it('returns UNKNOWN_ERROR for a non-envelope throw', () => {
    expect(describeFailure(new Error('query text'))).toStrictEqual({
      code: 'UNKNOWN_ERROR',
    });
  });
});
