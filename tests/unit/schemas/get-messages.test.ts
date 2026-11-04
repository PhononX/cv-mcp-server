/**
 * `get_messages` input bounds, enforced by the MCP SDK's zod validation
 * before the handler runs. They mirror cv-api `GetMessagesByIdsV5Payload`.
 */
import { getMessagesParams } from '../../../src/schemas';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe('getMessagesParams', () => {
  it.each([
    ['message_ids missing', {}],
    ['no message_ids', { message_ids: [] }],
    ['501 message_ids', { message_ids: ids(501) }],
    ["'' inside message_ids", { message_ids: ['a', ''] }],
    ["conversation_id ''", { message_ids: ['a'], conversation_id: '' }],
    ["language ''", { message_ids: ['a'], language: '' }],
  ])('rejects %s', (_label, input) => {
    expect(getMessagesParams.safeParse(input).success).toBe(false);
  });

  it.each([
    ['1 id', { message_ids: ['a'] }],
    ['500 ids', { message_ids: ids(500) }],
    [
      'every field',
      { message_ids: ['a', 'b'], conversation_id: 'c-1', language: 'es' },
    ],
  ])('accepts %s unchanged', (_label, input) => {
    const parsed = getMessagesParams.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(input);
  });
});
