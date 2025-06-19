import { z } from 'zod/v4';

import {
  getMessageByIdParams,
  getMessageByIdQueryParams,
} from '../generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';

// Create a combined schema for get_message_by_id that includes both path and query params
export const getMessageByIdSchema = z.object({
  ...getMessageByIdParams.shape, // This includes the 'id' field
  ...getMessageByIdQueryParams.shape, // This includes 'language' and 'fields'
});
