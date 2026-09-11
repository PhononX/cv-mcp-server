import {
  filterConversationsByName,
  filterConversationsByType,
} from '../../../src/utils/filter-conversations';

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

describe('filterConversationsByName', () => {
  it('matches case-insensitively', () => {
    const out = filterConversationsByName(RESPONSE, 'project x');

    expect(out.results.map((c) => c.id)).toEqual(['c2']);
  });

  // A caller asking for "project" should find "Project X" — requiring an exact
  // name would send them back to listing everything, which is the cost this
  // filter exists to avoid.
  it('matches on a substring rather than the whole name', () => {
    const out = filterConversationsByName(RESPONSE, 'roject');

    expect(out.results.map((c) => c.id)).toEqual(['c2']);
  });

  it('trims whitespace around the input', () => {
    const out = filterConversationsByName(RESPONSE, '  Standup \n');

    expect(out.results.map((c) => c.id)).toEqual(['c3']);
  });

  // Ambiguity is the agent's to resolve — the tool doc tells it to ask which
  // was meant, the way `search_users` already does, rather than have the
  // filter silently choose. The non-matching row keeps this from passing
  // against an implementation that filters nothing.
  it('returns every match rather than picking one', () => {
    const out = filterConversationsByName(
      {
        results_count: 3,
        results: [
          { id: 'c1', name: 'Project X' },
          { id: 'c2', name: 'Project X planning' },
          { id: 'c3', name: 'Standup' },
        ],
      },
      'project x',
    );

    expect(out.results.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('recomputes results_count', () => {
    const out = filterConversationsByName(RESPONSE, 'fred');

    expect(out.results_count).toBe(1);
  });

  // The point of the whole filter: an agent handed a bare `results: []` would
  // report "you have no conversation called X", which is wrong when the name
  // was misspelt or the conversation is older than the six-month window.
  it('reports the pre-filter total so an empty result cannot lie', () => {
    const out = filterConversationsByName(RESPONSE, 'nothing matches this');

    expect(out.results).toEqual([]);
    expect(out.results_count).toBe(0);
    expect(out.unfiltered_count).toBe(4);
  });

  it('reports unfiltered_count even when rows do match', () => {
    const out = filterConversationsByName(RESPONSE, 'fred');

    expect(out.unfiltered_count).toBe(4);
  });

  it('passes the response through by reference when name is omitted', () => {
    expect(filterConversationsByName(RESPONSE)).toBe(RESPONSE);
    expect(filterConversationsByName(RESPONSE, '')).toBe(RESPONSE);
    expect(filterConversationsByName(RESPONSE, '   ')).toBe(RESPONSE);
  });

  it('adds no unfiltered_count when it did not filter', () => {
    expect(filterConversationsByName(RESPONSE)).not.toHaveProperty(
      'unfiltered_count',
    );
  });

  it('does not mutate the input', () => {
    const input = JSON.parse(JSON.stringify(RESPONSE));
    filterConversationsByName(input, 'fred');

    expect(input.results).toHaveLength(4);
    expect(input.results_count).toBe(4);
    expect(input).not.toHaveProperty('unfiltered_count');
  });

  it('leaves a response with no results array alone', () => {
    const weird = { statusCode: 500 };

    expect(filterConversationsByName(weird, 'fred')).toBe(weird);
  });

  it('drops rows with a missing or non-string name', () => {
    const out = filterConversationsByName(
      {
        results_count: 3,
        results: [
          { id: 'c1', name: 'Fred' },
          { id: 'c2' },
          { id: 'c3', name: null },
        ],
      } as never,
      'fred',
    );

    expect(
      (out as { results: Array<{ id: string }> }).results.map((c) => c.id),
    ).toEqual(['c1']);
  });

  // The two row filters are independent, so composing them must narrow by both
  // — and the name filter runs last, so its count reflects what it looked at.
  it('composes with the type filter', () => {
    const out = filterConversationsByName(
      filterConversationsByType(RESPONSE, [
        'namedConversation',
        'asyncMeeting',
      ]),
      'project',
    );

    expect(out.results.map((c) => c.id)).toEqual(['c2']);
    expect(out.results_count).toBe(1);
    expect(out.unfiltered_count).toBe(2);
  });
});
