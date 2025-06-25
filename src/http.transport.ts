#!/usr/bin/env node

import express from 'express';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { env } from './config';
import server from './server';
import { logger } from './utils';

const app = express();
app.use(express.json());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.post('/mcp', async (req: any, res: any) => {
  // In stateless mode, create a new instance of transport and server for each request
  // to ensure complete isolation. A single instance would cause request ID collisions
  // when multiple clients connect concurrently.

  logger.info('Received MCP request', {
    body: req.body,
    headers: req.headers,
    method: req.method,
    url: req.url,
  });

  // Add detailed logging for debugging JSON-RPC parse errors
  logger.debug('Request body details', {
    bodyType: typeof req.body,
    bodyKeys: req.body ? Object.keys(req.body) : 'null/undefined',
    bodyStringified: JSON.stringify(req.body),
    contentType: req.headers['content-type'],
  });

  try {
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
    res.on('close', () => {
      logger.info('Request closed');
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error('Error handling MCP request:', error);

    // Log additional error details for debugging
    if (error instanceof Error) {
      logger.error('Error details', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    }

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.get('/mcp', async (req: any, res: any) => {
  logger.info('Received GET MCP request');
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    }),
  );
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.delete('/mcp', async (req: any, res: any) => {
  logger.info('Received DELETE MCP request');
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    }),
  );
});

// Start the server
const PORT = env.PORT;
app
  .listen(PORT, () => {
    logger.info(
      `MCP Stateless Streamable HTTP Server listening on port ${PORT}`,
    );
  })
  .on('error', (error) => {
    logger.error('Error starting MCP Stateless Streamable HTTP Server:', error);
  });
