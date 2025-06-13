import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { SERVICE_NAME, SERVICE_VERSION } from './constants';

import { McpToolResponse } from './interfaces';
import { formatToMCPToolResponse, logger } from './utils';
import {
  getCarbonVoiceSimplifiedAPI,
  ListMessagesParams,
  listMessagesQueryParams,
} from './generated';

// Create server instance
const server = new McpServer({
  name: SERVICE_NAME,
  version: SERVICE_VERSION,
  capabilities: {
    resources: {},
    tools: {},
  },
});

const api = getCarbonVoiceSimplifiedAPI();

/**
 * Server tools
 */

// Message Tools
server.registerTool(
  'list_messages',
  {
    description:
      'List Messages. By default returns messages created in last 5 days. The maximum allowed range between dates is 30 days.',
    inputSchema: listMessagesQueryParams.shape,
  },
  async (params: ListMessagesParams): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.listMessages(params));
    } catch (error) {
      logger.error('Error listing messages:', { params, error });
      return formatToMCPToolResponse(error);
    }
  },
);

export default server;
