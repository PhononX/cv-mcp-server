#!/usr/bin/env node
'use strict';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import server from './server';
import { SERVICE_NAME, SERVICE_VERSION } from './constants';
import { logger } from './utils';

// Set stdio mode for logger (Needed for the logger to work in stdio mode)
process.env.MCP_STDIO_MODE = 'true';

const logArgs = {
  name: SERVICE_NAME,
  version: SERVICE_VERSION,
};

async function runServer() {
  const transport = new StdioServerTransport();

  // Log startup information
  logger.debug('🚀 Starting stdio server...', logArgs);

  try {
    await server.connect(transport);
    logger.info('✅ MCP server connected to stdio transport', logArgs);
  } catch (error) {
    logger.error('❌ Failed to connect server to stdio transport', {
      error,
      ...logArgs,
    });

    process.exit(1);
  }
}

runServer().catch((error) => {
  logger.error('❌ Fatal server error', {
    error,
    ...logArgs,
  });

  process.exit(1);
});
