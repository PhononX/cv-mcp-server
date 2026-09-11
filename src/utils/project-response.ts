/**
 * Server-side response projection for MCP tools.
 *
 * The upstream API offers no way to ask for less: every read returns the full
 * object, and `get_current_user` alone is several KB of workspace GUIDs,
 * identities, lifecycle events and an open settings map when an agent usually
 * wants four values. `get_message`'s `fields` param is an EXPANSION param, not
 * a projection, so narrowing has to happen here.
 *
 * Contract (see `.specs/features/agent-efficiency-improvements/design.md` D3):
 *  - omitting `fields` returns the input BY REFERENCE, so behaviour and bytes
 *    are identical to not having this feature at all
 *  - paths are dot-separated and traverse arrays element-wise, so
 *    `results.id` projects `id` out of every element of `results`
 *  - pagination metadata is preserved whether or not it was requested, since
 *    stripping it would destroy the very "is there more?" signal the tool
 *    descriptions tell agents to rely on
 *  - unknown paths are ignored rather than rejected: a slightly wrong
 *    projection should degrade to a smaller payload, not cost a failed call
 *    and a retry
 */

/**
 * Top-level keys kept even when not requested. These are how an agent knows
 * whether to page; a projection that removed them would be actively harmful.
 * `filters` is deliberately NOT here — it echoes the request the agent just
 * made, so it is pure waste under a projection.
 */
const ALWAYS_PRESERVED = [
  'total',
  'results_count',
  'has_next_page',
  'has_more',
  'next_cursor',
  'previous_cursor',
  'page',
  'size',
  'sort_direction',
  'total_results',
  'total_unread',
] as const;

type Indexable = Record<string, unknown>;

/**
 * Path segments that must never be traversed or written.
 *
 * `response_fields` is caller-supplied and the payload is whatever the API
 * returned, so `a.__proto__.isError` used to walk into `Object.prototype` and
 * write there — polluting every object in the process. `formatToMCPToolResponse`
 * branches on `options.isError`, so that one key alone would have marked every
 * later response, in every session, as an error.
 *
 * `in` was part of the problem: `'__proto__' in anyObject` is true via the
 * prototype chain even when nothing owns it. Own-property checks below.
 */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

const owns = (source: Indexable, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(source, key);

const isPlainObject = (value: unknown): value is Indexable =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const copyPath = (
  target: Indexable,
  source: Indexable,
  segments: string[],
): void => {
  const [head, ...rest] = segments;
  if (!head || FORBIDDEN_SEGMENTS.has(head) || !owns(source, head)) {
    // Unknown or unsafe path: ignore it. Rejecting would cost a round trip,
    // and a caller with no business walking the prototype chain gets the same
    // treatment as one that simply mistyped a field.
    return;
  }

  const value = source[head];

  if (rest.length === 0) {
    target[head] = value;
    return;
  }

  if (Array.isArray(value)) {
    // Traverse element-wise so `results.id` works without an index.
    if (!Array.isArray(target[head])) {
      target[head] = value.map(() => ({}) as Indexable);
    }
    const slots = target[head] as Indexable[];
    value.forEach((element, index) => {
      if (isPlainObject(element) && isPlainObject(slots[index])) {
        copyPath(slots[index], element, rest);
      }
    });
    return;
  }

  if (isPlainObject(value)) {
    if (!isPlainObject(target[head])) {
      target[head] = {} as Indexable;
    }
    copyPath(target[head] as Indexable, value, rest);
    return;
  }

  // The path goes deeper than the data does — nothing to copy.
};

const projectObject = (source: Indexable, fields: string[]): Indexable => {
  const out: Indexable = {};

  fields.forEach((field) => {
    const segments = field
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length > 0) {
      copyPath(out, source, segments);
    }
  });

  ALWAYS_PRESERVED.forEach((key) => {
    if (owns(source, key)) {
      out[key] = source[key];
    }
  });

  return out;
};

/**
 * Narrows `data` to `fields`. Returns `data` unchanged (by reference) when
 * `fields` is omitted or empty.
 */
export const projectResponse = <T>(data: T, fields?: string[]): unknown => {
  if (!fields || fields.length === 0) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((element) =>
      isPlainObject(element) ? projectObject(element, fields) : element,
    );
  }

  if (!isPlainObject(data)) {
    return data;
  }

  return projectObject(data, fields);
};
