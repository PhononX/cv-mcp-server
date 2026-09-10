import { projectResponse } from '../../../src/utils/project-response';

describe('projectResponse', () => {
  describe('backward compatibility', () => {
    const payload = { a: 1, b: { c: 2 } };

    it('returns the input BY REFERENCE when fields are omitted', () => {
      // This identity is what makes the feature non-breaking: an existing
      // integration that never passes response_fields gets byte-identical
      // output, and the existing test suite passes unmodified.
      expect(projectResponse(payload)).toBe(payload);
    });

    it('returns the input by reference for an empty field list', () => {
      expect(projectResponse(payload, [])).toBe(payload);
    });

    it('passes primitives and null through untouched', () => {
      expect(projectResponse('text', ['a'])).toBe('text');
      expect(projectResponse(42, ['a'])).toBe(42);
      expect(projectResponse(null, ['a'])).toBeNull();
      expect(projectResponse(undefined, ['a'])).toBeUndefined();
    });
  });

  describe('flat and nested paths', () => {
    const user = {
      user_guid: 'u-1',
      first_name: 'Alice',
      email_txt: 'a@example.com',
      settings: { theme: 'dark', locale: 'en' },
      lifecycle_events: [{ name: 'signup' }],
    };

    it('keeps only the requested top-level keys', () => {
      expect(projectResponse(user, ['user_guid', 'first_name'])).toEqual({
        user_guid: 'u-1',
        first_name: 'Alice',
      });
    });

    it('projects a nested path without pulling its siblings', () => {
      expect(projectResponse(user, ['settings.theme'])).toEqual({
        settings: { theme: 'dark' },
      });
    });

    it('merges several paths under a shared prefix', () => {
      expect(
        projectResponse(user, ['settings.theme', 'settings.locale']),
      ).toEqual({ settings: { theme: 'dark', locale: 'en' } });
    });

    it('takes a whole subtree when the path stops at an object', () => {
      expect(projectResponse(user, ['settings'])).toEqual({
        settings: { theme: 'dark', locale: 'en' },
      });
    });

    it('drops the heavy fields it was not asked for', () => {
      const result = projectResponse(user, ['user_guid']) as Record<
        string,
        unknown
      >;
      expect(result).not.toHaveProperty('lifecycle_events');
      expect(result).not.toHaveProperty('settings');
    });
  });

  describe('array traversal', () => {
    const listing = {
      results: [
        { id: 'm-1', transcript: 'one', audio_url: 'https://a/1' },
        { id: 'm-2', transcript: 'two', audio_url: 'https://a/2' },
      ],
    };

    it('projects a field out of every array element', () => {
      expect(projectResponse(listing, ['results.id'])).toEqual({
        results: [{ id: 'm-1' }, { id: 'm-2' }],
      });
    });

    it('projects several fields per element', () => {
      expect(
        projectResponse(listing, ['results.id', 'results.transcript']),
      ).toEqual({
        results: [
          { id: 'm-1', transcript: 'one' },
          { id: 'm-2', transcript: 'two' },
        ],
      });
    });

    it('handles a top-level array response', () => {
      const workspaces = [
        { id: 'w-1', name: 'One', extra: 1 },
        { id: 'w-2', name: 'Two', extra: 2 },
      ];
      expect(projectResponse(workspaces, ['id'])).toEqual([
        { id: 'w-1' },
        { id: 'w-2' },
      ]);
    });

    it('leaves primitive array elements alone', () => {
      expect(projectResponse({ tags: ['a', 'b'] }, ['tags'])).toEqual({
        tags: ['a', 'b'],
      });
    });

    it('skips primitive elements when a deeper path is requested', () => {
      expect(projectResponse({ tags: ['a', 'b'] }, ['tags.id'])).toEqual({
        tags: [{}, {}],
      });
    });

    it('projects through nested arrays', () => {
      const nested = {
        results: [
          {
            id: 'r-1',
            responses: [{ language: 'en', text: 'hi', html: '<p>' }],
          },
        ],
      };
      expect(
        projectResponse(nested, ['results.id', 'results.responses.text']),
      ).toEqual({
        results: [{ id: 'r-1', responses: [{ text: 'hi' }] }],
      });
    });
  });

  describe('pagination metadata', () => {
    it('preserves paging keys that were not requested', () => {
      // Stripping these would destroy the "is there more?" signal the tool
      // descriptions tell agents to rely on.
      const page = {
        total: 120,
        results_count: 20,
        has_next_page: true,
        page: 1,
        size: 20,
        sort_direction: 'DESC',
        results: [{ id: 'm-1', transcript: 'x' }],
      };

      expect(projectResponse(page, ['results.id'])).toEqual({
        total: 120,
        results_count: 20,
        has_next_page: true,
        page: 1,
        size: 20,
        sort_direction: 'DESC',
        results: [{ id: 'm-1' }],
      });
    });

    it('preserves cursor keys used by the action item and search tools', () => {
      const page = {
        has_more: true,
        next_cursor: 'cur-1',
        previous_cursor: 'cur-0',
        results: [{ id: 'a-1', title: 't', notes_text: 'n' }],
      };
      expect(projectResponse(page, ['results.id'])).toEqual({
        has_more: true,
        next_cursor: 'cur-1',
        previous_cursor: 'cur-0',
        results: [{ id: 'a-1' }],
      });
    });

    it('preserves the inbox notification counts', () => {
      const page = {
        total_results: 9,
        total_unread: 3,
        filters: { category: 'mentions', limit: 50 },
        results: [{ id: 'n-1', body: 'x' }],
      };
      const result = projectResponse(page, ['results.id']) as Record<
        string,
        unknown
      >;
      expect(result.total_results).toBe(9);
      expect(result.total_unread).toBe(3);
      // `filters` just echoes the request, so it is waste under a projection.
      expect(result).not.toHaveProperty('filters');
    });
  });

  describe('tolerance of bad input', () => {
    const payload = { a: 1, b: { c: 2 } };

    it('ignores unknown paths instead of failing the call', () => {
      expect(projectResponse(payload, ['nope', 'a'])).toEqual({ a: 1 });
    });

    it('returns an object with only paging keys when nothing matches', () => {
      expect(projectResponse(payload, ['nope'])).toEqual({});
    });

    it('ignores a path deeper than the data', () => {
      expect(projectResponse(payload, ['a.b.c'])).toEqual({});
    });

    it('tolerates empty segments and stray whitespace', () => {
      expect(projectResponse(payload, [' a ', '', 'b..c'])).toEqual({
        a: 1,
        b: { c: 2 },
      });
    });

    it('does not mutate the source object', () => {
      const source = { a: 1, nested: { keep: 1, drop: 2 } };
      const snapshot = JSON.stringify(source);
      projectResponse(source, ['nested.keep']);
      expect(JSON.stringify(source)).toBe(snapshot);
    });
  });

  describe('payload size', () => {
    it('substantially shrinks a get_current_user-shaped payload', () => {
      // The concrete case the review called out: ~95% waste on every call.
      const whoami = {
        success: true,
        user: {
          user_guid: 'u-1',
          first_name: 'Alice',
          last_name: 'Smith',
          email_txt: 'a@example.com',
          workspace_guids: Array.from({ length: 60 }, (_, i) => `ws-${i}`),
          identities: Array.from({ length: 6 }, (_, i) => ({
            provider: `p-${i}`,
            sub: `s-${i}`,
            verified: true,
          })),
          entries: Array.from({ length: 20 }, (_, i) => ({
            id: `e-${i}`,
            kind: 'contact',
          })),
          lifecycle_events: Array.from({ length: 15 }, (_, i) => ({
            name: `evt-${i}`,
            count: i,
          })),
          settings: Object.fromEntries(
            Array.from({ length: 40 }, (_, i) => [`setting_${i}`, '']),
          ),
        },
        settings: { is_gated: false, member_count: 3 },
      };

      const before = JSON.stringify(whoami).length;
      const after = JSON.stringify(
        projectResponse(whoami, [
          'user.user_guid',
          'user.first_name',
          'user.email_txt',
          'user.workspace_guids',
        ]),
      ).length;

      expect(after).toBeLessThan(before);
      // Keeps the 60 workspace GUIDs and still cuts the payload by over half.
      expect(after / before).toBeLessThan(0.5);
    });
  });
});
