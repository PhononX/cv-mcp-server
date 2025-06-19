import { z } from 'zod';

import {
  addLinkAttachmentsToMessageBody,
  addLinkAttachmentsToMessageParams,
  createConversationMessageBody,
  createConversationMessageParams,
  getMessageByIdParams,
  getMessageByIdQueryParams,
} from '../generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';

// Define the base types from the Zod schemas
type MessagePathParams = z.infer<typeof getMessageByIdParams>;
type MessageQueryParams = z.infer<typeof getMessageByIdQueryParams>;
export type GetMessageInput = MessagePathParams & MessageQueryParams;

type CreateConversationMessageParams = z.infer<
  typeof createConversationMessageParams
>;
type CreateConversationMessageBody = z.infer<
  typeof createConversationMessageBody
>;
export type CreateConversationMessageInput = CreateConversationMessageParams &
  CreateConversationMessageBody;

type AddLinkAttachmentsToMessageParams = z.infer<
  typeof addLinkAttachmentsToMessageParams
>;
type AddLinkAttachmentsToMessageBody = z.infer<
  typeof addLinkAttachmentsToMessageBody
>;
export type AddLinkAttachmentsToMessageInput =
  AddLinkAttachmentsToMessageParams & AddLinkAttachmentsToMessageBody;
