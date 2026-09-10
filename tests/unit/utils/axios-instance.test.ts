import {
  compactValidationErrors,
  serializeParams,
} from '../../../src/utils/axios-instance';

describe('serializeParams', () => {
  it('serializes array values as repeated keys without brackets', () => {
    const result = serializeParams({
      user_ids: ['travis', 'jesus', 'something-that-doesnt-exits'],
      match: 'all',
    });

    expect(result).toBe(
      'user_ids=travis&user_ids=jesus&user_ids=something-that-doesnt-exits&match=all',
    );
  });

  it('serializes scalar values normally', () => {
    expect(serializeParams({ match: 'any' })).toBe('match=any');
  });

  it('omits undefined and null values', () => {
    expect(
      serializeParams({ user_ids: undefined, match: null, foo: 'bar' }),
    ).toBe('foo=bar');
  });

  it('returns an empty string for empty params', () => {
    expect(serializeParams({})).toBe('');
  });

  it('percent-encodes special characters in values', () => {
    expect(serializeParams({ q: 'a b&c' })).toBe('q=a+b%26c');
  });
});

describe('serializeParams single-element arrays', () => {
  // Live bug seen in MCP server logs: list_messages with one user_id returned
  //   400 BAD_REQUEST { property: "user_ids", ... }
  //
  // Repeated keys only parse back as an array when the key repeats. Express
  // turns `?user_ids=a` into the STRING 'a' under both the `simple` and
  // `extended` query parsers, and the upstream DTOs validate these fields with
  // @IsArray() and no coercing @Transform — so exactly one id failed while two
  // or more worked. "Messages from one person" is the most natural form of the
  // query, so this failed constantly.
  it('emits a single-element array twice so it parses back as an array', () => {
    expect(serializeParams({ user_ids: ['solo'] })).toBe(
      'user_ids=solo&user_ids=solo',
    );
  });

  it('leaves multi-element arrays alone', () => {
    expect(serializeParams({ user_ids: ['a', 'b'] })).toBe(
      'user_ids=a&user_ids=b',
    );
    expect(serializeParams({ user_ids: ['a', 'b', 'c'] })).toBe(
      'user_ids=a&user_ids=b&user_ids=c',
    );
  });

  it('omits an empty array rather than emitting a bare key', () => {
    // `user_ids=` would arrive as an empty string and fail @IsArray too.
    expect(serializeParams({ user_ids: [], size: 20 })).toBe('size=20');
  });

  it('applies to every array query param the API takes as a filter set', () => {
    // All of these are filter SETS upstream, so a duplicate is a no-op.
    [
      'creator_ids',
      'tagged_user_ids',
      'conversation_ids',
      'workspace_ids',
      'label_ids',
    ].forEach((key) => {
      expect(serializeParams({ [key]: ['one'] })).toBe(`${key}=one&${key}=one`);
    });
  });

  it('does not disturb scalars alongside a single-element array', () => {
    expect(serializeParams({ size: 20, user_ids: ['solo'] })).toBe(
      'size=20&user_ids=solo&user_ids=solo',
    );
  });
});

describe('compactValidationErrors', () => {
  // From a live report: list_messages with one user_id returned a deeply
  // nested blob — the whole request DTO dumped under each error's `target`,
  // with the one useful sentence buried inside. An agent has to mine that.
  it('flattens class-validator errors to readable one-liners', () => {
    expect(
      compactValidationErrors([
        {
          property: 'user_ids',
          value: 'travis',
          constraints: { isArray: 'user_ids must be an array' },
          target: { size: 20, page: 1, sort_direction: 'DESC' },
        },
      ]),
    ).toEqual(['user_ids: user_ids must be an array']);
  });

  it('reports every failed constraint on a property', () => {
    expect(
      compactValidationErrors([
        {
          property: 'limit',
          constraints: {
            isInt: 'limit must be an integer',
            min: 'limit must not be less than 1',
          },
        },
      ]),
    ).toEqual([
      'limit: limit must be an integer',
      'limit: limit must not be less than 1',
    ]);
  });

  it('walks nested children so sub-DTO failures survive', () => {
    expect(
      compactValidationErrors([
        {
          property: 'to',
          children: [
            {
              property: 'user_ids',
              constraints: { isArray: 'user_ids must be an array' },
            },
          ],
        },
      ]),
    ).toEqual(['to.user_ids: user_ids must be an array']);
  });

  it('passes through plain string messages', () => {
    expect(compactValidationErrors(['something went wrong'])).toEqual([
      'something went wrong',
    ]);
  });

  it('returns undefined for a non-array message, leaving it untouched', () => {
    expect(
      compactValidationErrors('Invalid request parameters'),
    ).toBeUndefined();
    expect(compactValidationErrors(undefined)).toBeUndefined();
  });

  it('returns undefined when an array carries no constraints', () => {
    expect(compactValidationErrors([{ property: 'x' }])).toBeUndefined();
  });
});
