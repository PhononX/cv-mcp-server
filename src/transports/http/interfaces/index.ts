import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Session management
type SessionMetrics = {
  sessionId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  totalInteractions: number;
  totalToolCalls: number;
};

export type Session = {
  transport: StreamableHTTPServerTransport;
  timeout: NodeJS.Timeout;
  userId: string;
  destroying?: boolean; // Flag to prevent recursive destruction
  metrics: SessionMetrics;
};

// Carbon Voice API health cache
export type ApiHealthStatus = {
  isHealthy: boolean;
  lastChecked: string;
  error?: string;
};
