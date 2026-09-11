import { filterConversationsByType } from '../../../src/utils/filter-conversations';

const RESPONSE = {
  results_count: 4,
  results: [
    { id: 'c1', name: 'Fred', workspace_id: 'w1', type: 'directMessage' },
    {
      id: 'c2',
      name: 'Project X',
      workspace_id: 'w1',
      type: 'namedConversation',
    },
    { id: 'c3', name: 'Standup', workspace_id: 'w1', type: 'asyncMeeting' },
    {
      id: 'c4',
      name: 'Acme',
      workspace_id: 'w1',
      type: 'customerConversation',
    },
  ],
};

describe('filterConversationsByType', () => {
  it('keeps only the requested type', () => {
    const out = filterConversationsByType(RESPONSE, ['directMessage']);

    expect(out.results.map((c) => c.id)).toEqual(['c1']);
  });

  it('accepts several types', () => {
    const out = filterConversationsByType(RESPONSE, [
      'namedConversation',
      'asyncMeeting',
    ]);

    expect(out.results.map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  // The tool documents results_count as the size of what it returns, so leaving
  // the upstream total would make it lie about its own response.
  it('recomputes results_count', () => {
    const out = filterConversationsByType(RESPONSE, ['directMessage']);

    expect(out.results_count).toBe(1);
  });

  it('returns an empty set rather than failing when nothing matches', () => {
    const out = filterConversationsByType(
      { results_count: 1, results: [{ id: 'c1', type: 'namedConversation' }] },
      ['directMessage'],
    );

    expect(out.results).toEqual([]);
    expect(out.results_count).toBe(0);
  });

  it('passes the response through by reference when types is omitted', () => {
    expect(filterConversationsByType(RESPONSE)).toBe(RESPONSE);
    expect(filterConversationsByType(RESPONSE, [])).toBe(RESPONSE);
  });

  it('does not mutate the input', () => {
    const input = JSON.parse(JSON.stringify(RESPONSE));
    filterConversationsByType(input, ['directMessage']);

    expect(input.results).toHaveLength(4);
    expect(input.results_count).toBe(4);
  });

  it('leaves a response with no results array alone', () => {
    const weird = { statusCode: 500 };

    expect(filterConversationsByType(weird, ['directMessage'])).toBe(weird);
  });

  it('drops rows with a missing or non-string type', () => {
    const out = filterConversationsByType(
      {
        results_count: 3,
        results: [
          { id: 'c1', type: 'directMessage' },
          { id: 'c2' },
          { id: 'c3', type: null },
        ],
      } as never,
      ['directMessage'],
    );

    expect(
      (out as { results: Array<{ id: string }> }).results.map((c) => c.id),
    ).toEqual(['c1']);
  });
});
