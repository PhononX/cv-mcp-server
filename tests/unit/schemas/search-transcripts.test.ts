/**
 * STT-01: the `search_transcripts` input bounds, enforced by the MCP SDK's
 * zod validation before the handler runs (so a rejected call makes no API
 * request). The date rule mirrors cv-api's `ISO_OFFSET_SUFFIX`.
 */
import { searchTranscriptsParams } from '../../../src/schemas';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

const valid = { query: 'launch date decision' };

describe('searchTranscriptsParams (STT-01)', () => {
  describe('rejects', () => {
    it.each([
      ['query missing', {}],
      ['query empty', { query: '' }],
      ['query blank', { query: '   ' }],
      ['query of 501 chars', { query: 'a'.repeat(501) }],
      ['51 conversation_ids', { ...valid, conversation_ids: ids(51) }],
      ['51 creator_ids', { ...valid, creator_ids: ids(51) }],
      ['501 exclude_message_ids', { ...valid, exclude_message_ids: ids(501) }],
      ["'' inside conversation_ids", { ...valid, conversation_ids: ['a', ''] }],
      ["'' inside creator_ids", { ...valid, creator_ids: ['a', ''] }],
      [
        "'' inside exclude_message_ids",
        { ...valid, exclude_message_ids: ['a', ''] },
      ],
      [
        'start_date without offset',
        { ...valid, start_date: '2026-10-01T10:00:00' },
      ],
      [
        'end_date without offset',
        { ...valid, end_date: '2026-10-01T10:00:00' },
      ],
      [
        'start_date with +0300 offset',
        { ...valid, start_date: '2026-10-01T10:00:00+0300' },
      ],
      [
        'end_date with +0300 offset',
        { ...valid, end_date: '2026-10-01T10:00:00+0300' },
      ],
      ['limit 0', { ...valid, limit: 0 }],
      ['limit 51', { ...valid, limit: 51 }],
      ['limit 2.5', { ...valid, limit: 2.5 }],
      ["workspace_id ''", { ...valid, workspace_id: '' }],
    ])('%s', (_label, input) => {
      expect(searchTranscriptsParams.safeParse(input).success).toBe(false);
    });
  });

  describe('accepts', () => {
    it.each([
      [
        'dates ending in Z',
        {
          start_date: '2026-10-01T10:00:00Z',
          end_date: '2026-10-02T10:00:00Z',
        },
      ],
      [
        'dates ending in -03:00',
        {
          start_date: '2026-10-01T10:00:00-03:00',
          end_date: '2026-10-02T10:00:00-03:00',
        },
      ],
      ['a 500-char query', { query: 'a'.repeat(500) }],
      ['50 conversation_ids', { conversation_ids: ids(50) }],
      ['50 creator_ids', { creator_ids: ids(50) }],
      ['500 exclude_message_ids', { exclude_message_ids: ids(500) }],
      ['limit 1', { limit: 1 }],
      ['limit 50', { limit: 50 }],
      ['a workspace_id', { workspace_id: 'ws-1' }],
    ])('%s', (_label, extra) => {
      const input = { ...valid, ...extra };
      const parsed = searchTranscriptsParams.safeParse(input);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(input);
    });

    it('omitted optionals stay absent, with no default limit', () => {
      const parsed = searchTranscriptsParams.parse(valid);
      expect(parsed).toEqual(valid);
      expect('limit' in parsed).toBe(false);
    });
  });
});
