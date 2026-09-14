import { z } from 'zod';

/**
 * Schema for the full Carbon Voice API's synchronous action-item suggestion
 * endpoint (`POST /action-items/suggestions/{message_id}`). It is marked
 * `@ApiExcludeEndpoint()` upstream, so it never reaches the OpenAPI document
 * Orval generates from and has no generated client — same situation as the
 * search endpoints in `./search`.
 */
export const suggestActionItemsFromMessageParams = z.object({
  message_id: z
    .string()
    .describe(
      'The message to extract action items from. Exactly one — for several messages at once use `suggest_action_items_from_messages`.',
    ),
});

export type SuggestActionItemsFromMessageParams = z.infer<
  typeof suggestActionItemsFromMessageParams
>;
