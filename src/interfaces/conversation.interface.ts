import { z } from 'zod';

import {
  catchUpConversationParams,
  summarizeConversationParams,
} from '../schemas';

export type SummarizeConversationParams = z.infer<
  typeof summarizeConversationParams
>;

export type CatchUpConversationParams = z.infer<
  typeof catchUpConversationParams
>;
