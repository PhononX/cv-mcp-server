/**
 * cv-api `MessageV6`, reduced to the fields this server reads. Every other
 * field passes through to the agent untouched.
 */
export interface MessageV6 {
  id: string;
  status: string;
  [field: string]: unknown;
}

export interface GetMessagesResponse {
  /** `active` messages, in request order. */
  results: MessageV6[];
  /** Requested ids not in `results`: unknown, not accessible, or not `active`. */
  missing_ids: string[];
}
