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
