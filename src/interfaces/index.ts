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
};
