import { serializeParams } from '../../../src/utils/axios-instance';

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
