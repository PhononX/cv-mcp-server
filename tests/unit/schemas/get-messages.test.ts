/**
 * `get_messages` input bounds, enforced by the MCP SDK's zod validation
 * before the handler runs. Why they differ from cv-api: see the schema JSDoc.
 */
import { getMessagesParams } from '../../../src/schemas';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe('getMessagesParams', () => {
  it.each([
    ['message_ids missing', {}],
    ['no message_ids', { message_ids: [] }],
    ['101 message_ids', { message_ids: ids(101) }],
    ["'' inside message_ids", { message_ids: ['a', ''] }],
    ["language ''", { message_ids: ['a'], language: '' }],
  ])('rejects %s', (_label, input) => {
    expect(getMessagesParams.safeParse(input).success).toBe(false);
  });

  it.each([
    ['1 id', { message_ids: ['a'] }],
    ['100 ids', { message_ids: ids(100) }],
    ['every field', { message_ids: ['a', 'b'], language: 'es' }],
  ])('accepts %s unchanged', (_label, input) => {
    const parsed = getMessagesParams.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(input);
  });

  it('has no conversation_id', () => {
    expect(Object.keys(getMessagesParams.shape)).not.toContain(
      'conversation_id',
    );
  });
});
