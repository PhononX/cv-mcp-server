// #!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { SERVICE_NAME, SERVICE_VERSION } from './constants.js';
import { CarbonVoiceClient } from './carbon-voice.js';
// import logger from './utils/logger';
// import { env } from './config/env';
// import { CarbonVoiceClient } from './carbon-voice';

// Create server instance
const server = new McpServer({
  name: SERVICE_NAME,
  version: SERVICE_VERSION,
  capabilities: {
    resources: {},
    tools: {},
  },
});

// logger.info(`${SERVICE_VERSION} initialized`, {
//   name: SERVICE_NAME,
//   version: SERVICE_VERSION,
//   env: env.NODE_ENV,
// });

/**
 * Carbon Voice Client
 */
const carbonVoiceClient = CarbonVoiceClient.getInstance();

/**
 * Server tools
 */
server.tool(
  'list_conversations',
  'List conversations',
  {
    workspace_id: z.string().optional().describe('Carbon Voice workspace ID'),
  },
  async ({ workspace_id }) => {
    // const channelsData = await carbonVoiceClient.listAllConversations();

    return {
      content: [
        {
          type: 'text',
          // text: JSON.stringify(channelsData, null, 2),
          text: 'test',
        },
      ],
    };
  },
);

export default server;

// async function runServer() {
//   const transport = new StdioServerTransport();
//   console.error('Connecting server to transport...');

//   await server.connect(transport);

//   console.error(`${SERVICE_NAME} running on stdio`);
// }

// runServer().catch((error) => {
//   console.error('Fatal error in runServer():', error);
//   process.exit(1);
// });
