import { MessageV6 } from './messages-by-ids.interface';

/**
 * One row of cv-api `GET /v6/message/:message_id/interactions`
 * (`MessageInteraction` in cv-api `src/message/dto/MessageInteraction.dto.ts`).
 */
export interface MessageInteraction {
  user_id: string;
  /** Furthest point the user has heard, in ms. 0 when they never played it. */
  heard_ms: number;
  /**
   * cv-api `user_message.notified`: true while the conversation is unread for
   * the user. Opening the conversation clears it, playing the message does
   * not; false also when the user has no row (joined after it was posted).
   */
  is_notified: boolean;
  /** Curated reaction slugs (`love`, `lol`, ...) mixed with raw emoji strings. */
  reaction_ids: string[];
}

/** cv-api `MessageInteractionsV6Response`. */
export interface MessageInteractionsV6Response {
  message: MessageV6;
  interactions: MessageInteraction[];
}

/** A `MessageInteraction` with what an agent needs to answer "who listened, how much". */
export interface MessageInteractionRow extends MessageInteraction {
  /** Display name from `POST /contacts`; absent when it could not be resolved. */
  name?: string;
  /** `heard_ms` as a whole percent of the audio, 0-100; null when the message has no audio duration. */
  heard_percent: number | null;
}

export interface GetMessageInteractionsResponse {
  message: MessageV6;
  /** One row per audience member, the message's creator left out. */
  interactions: MessageInteractionRow[];
}
