import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import server from './server';
import { SERVICE_NAME } from './constants';
import logger from './utils/logger';

// Set stdio mode for logger (Needed for the logger to work in stdio mode)
process.env.MCP_STDIO_MODE = 'true';

async function runServer() {
  const transport = new StdioServerTransport();

  // Log startup information
  logger.debug('🚀 Starting stdio server...', {
    name: SERVICE_NAME,
  });

  try {
    await server.connect(transport);
    logger.info('✅ Server connected to stdio transport');
  } catch (error) {
    logger.error('❌ Failed to connect server to stdio transport', { error });
    process.exit(1);
  }
}

runServer().catch((error) => {
  logger.error('❌ Fatal server error', { error });
  process.exit(1);
});
