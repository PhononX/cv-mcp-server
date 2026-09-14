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

// Exercises the real 400 path end to end — the error handler is not exported,
// and the defect being guarded (nested `target` dumps surviving) only shows up
// in the shape that actually reaches the caller.
describe('validation errors through mutator', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const http = require('node:http');
  let server: import('node:http').Server;

  // A nested DTO failure: every node carries its own `target` with the whole
  // request object on it, which is what made these payloads enormous.
  const NESTED_VALIDATION_400 = {
    statusCode: 400,
    message: [
      {
        property: 'to',
        target: { to: { user_ids: 'travis' }, transcript: 'hi' },
        children: [
          {
            property: 'user_ids',
            value: 'travis',
            target: { user_ids: 'travis' },
            constraints: { isArray: 'user_ids must be an array' },
            children: [
              {
                property: 'deep',
                target: { user_ids: 'travis' },
                constraints: { isString: 'deep must be a string' },
              },
            ],
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    server = http.createServer(
      (_req: unknown, res: import('node:http').ServerResponse) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(NESTED_VALIDATION_400));
      },
    );
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as { port: number };
    process.env.CARBON_VOICE_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.CARBON_VOICE_API_KEY = 'test-key';
    // This sandbox routes outbound HTTP through an agent proxy that rejects
    // plain-http absolute-form requests; loopback must bypass it.
    process.env.NO_PROXY = '127.0.0.1,localhost';
    process.env.no_proxy = '127.0.0.1,localhost';
    // The axios instance is built at module load, so it captured the default
    // base URL before this ran. Drop it and let the lazy require below build a
    // fresh one against the local server.
    jest.resetModules();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const failedCall = async () => {
    const { mutator } = require('../../../src/utils/axios-instance');
    return mutator({ url: '/anything', method: 'GET' }).catch(
      (e: unknown) => e,
    );
  };
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('strips every target, including nested children', async () => {
    const error = await failedCall();

    // Any surviving `target` means a full request dump is still on the wire.
    expect(JSON.stringify(error)).not.toContain('"target"');
  });

  it('keeps the useful parts of a nested failure', async () => {
    const error = await failedCall();
    const serialized = JSON.stringify(error);

    expect(serialized).toContain('user_ids must be an array');
    expect(serialized).toContain('deep must be a string');
  });

  it('flattens the nested messages into readable one-liners, with the path', async () => {
    const error = await failedCall();

    // The dotted path is the point: `to.user_ids` tells an agent WHICH field of
    // which sub-object to fix, which the raw nested blob buried.
    expect(error.body.error.message).toBe(
      'to.user_ids: user_ids must be an array; to.user_ids.deep: deep must be a string',
    );
    expect(error.body.error.validation).toEqual([
      'to.user_ids: user_ids must be an array',
      'to.user_ids.deep: deep must be a string',
    ]);
  });
});
