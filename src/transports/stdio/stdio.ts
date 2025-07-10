import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import server from '../../server';
import { logger } from '../../utils';

async function main() {
  logger.info('Starting server with stdio transport');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Server connected to stdio transport');
}

main().catch((err) => {
  logger.error('Error in main', { error: err });
  process.exit(1);
});
