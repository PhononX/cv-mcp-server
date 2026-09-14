/**
 * Conversation types the upstream `GET /simplified/conversations` returns.
 * Mirrors cv-api's `ChannelType`.
 */
export type ConversationTypeFilter =
  | 'directMessage'
  | 'customerConversation'
  | 'namedConversation'
  | 'asyncMeeting';

interface ConversationListResponse {
  results_count?: number;
  results?: Array<{ type?: string }>;
}

/**
 * Keeps only the conversations whose `type` is in `types`.
 *
 * The upstream endpoint has no `type` parameter and no paging — it returns
 * every conversation active in the last six months — but each result carries
 * its `type`, so the filter costs nothing to apply here. It does not reduce
 * what cv-api sends us; it reduces what reaches the agent's context, which is
 * the expensive half.
 *
 * `results_count` is recomputed, because the tool documents it as the size of
 * the returned set. Leaving the upstream total in place would make the tool
 * lie about its own response.
 *
 * Omitted or empty `types` returns the input by reference, so the behaviour is
 * identical to not having the filter at all.
 */
export const filterConversationsByType = <T>(
  response: T,
  types?: ConversationTypeFilter[],
): T => {
  if (!types?.length) {
    return response;
  }
  const body = response as ConversationListResponse;
  if (!Array.isArray(body?.results)) {
    return response;
  }

  const wanted = new Set<string>(types);
  const results = body.results.filter(
    (c) => typeof c?.type === 'string' && wanted.has(c.type),
  );

  return { ...body, results, results_count: results.length } as T;
};

interface NameFilterableResponse {
  results_count?: number;
  unfiltered_count?: number;
  results?: Array<{ name?: string }>;
}

/**
 * Keeps only the conversations whose `name` contains `name`, case-insensitively.
 *
 * Same rationale as `filterConversationsByType`: the upstream endpoint has no
 * `name` parameter and no paging, so the only place this can happen is here.
 * It does not reduce what cv-api sends us, but it is the difference between
 * an agent paying for every conversation the caller is in and paying for the
 * one row it asked about.
 *
 * A substring match rather than an exact one, because a caller asking for
 * "project x" should find "Project X planning" — the agent is told to ask
 * which was meant when several match, rather than picking one.
 *
 * `unfiltered_count` is the important part. An agent handed a bare
 * `results: []` will report "you have no conversation called X", which is
 * wrong and unrecoverable when the name was merely misspelled or the
 * conversation is older than the six-month window. Reporting how many rows
 * the filter looked at lets the agent tell "nothing was there to match" apart
 * from "none of your 47 matched that string".
 *
 * Note what it is counted against: the rows THIS filter saw, which is after
 * `user_ids` (applied upstream) and `types` (applied before this). So
 * `unfiltered_count: 0` means the other filters already left nothing — not
 * that the caller has no conversations. The tool doc has to say so, or an
 * agent combining filters walks straight back into the false negative this
 * field exists to prevent.
 *
 * Omitted, empty or whitespace-only `name` returns the input by reference, so
 * the behaviour is identical to not having the filter at all — no
 * `unfiltered_count` either, since there is no filtered-out set to explain.
 */
export const filterConversationsByName = <T>(
  response: T,
  name?: string,
): T & { unfiltered_count?: number } => {
  type Filtered = T & { unfiltered_count?: number };
  const needle = name?.trim().toLowerCase();
  if (!needle) {
    return response as Filtered;
  }
  const body = response as NameFilterableResponse;
  if (!Array.isArray(body?.results)) {
    // `results` is optional upstream, so a listing with none is an empty set
    // rather than a malformed body. The doc tells the agent to ALWAYS check
    // `unfiltered_count`, so that case has to carry one — omitting it is the
    // one shape where "nothing is there" cannot be justified from the
    // response. Anything that is not a listing (an error payload, say) still
    // passes through untouched.
    return typeof body?.results_count === 'number'
      ? ({ ...body, unfiltered_count: 0 } as unknown as Filtered)
      : (response as Filtered);
  }

  const unfiltered_count = body.results.length;
  const results = body.results.filter(
    (c) => typeof c?.name === 'string' && c.name.toLowerCase().includes(needle),
  );

  return {
    ...body,
    results,
    results_count: results.length,
    unfiltered_count,
  } as unknown as Filtered;
};
