export type McpToolResponse = {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'audio'; data: string; mimeType: string }
    | {
        type: 'resource';
        resource:
          | { text: string; uri: string; mimeType?: string }
          | { uri: string; blob: string; mimeType?: string };
      }
  >;
  _meta?: Record<string, unknown>;
  structuredContent?: Record<string, unknown>;
  /**
   * Marks the call as failed. Without it a failure is byte-indistinguishable
   * from a success at the protocol level, and the agent has to parse the body
   * hunting for an `error` key to notice anything went wrong.
   */
  isError?: boolean;
};
