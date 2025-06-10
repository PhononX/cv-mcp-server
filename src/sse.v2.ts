// import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
// import { createServer } from './server.js';
// import express from 'express';

// // Create Express app and MCP server
// const app = express();
// const mcpServer = createServer();

// // Handle SSE connections
// app.get('/mcp', (req, res) => {
//   const transport = new SSEServerTransport('/mcp', res);

//   // Set SSE headers
//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');
//   res.setHeader('Access-Control-Allow-Origin', '*'); // For development, restrict in production

//   transport.handleMessage(req);

//   // Handle the SSE connection using the MCP server's connect method
//   mcpServer.connect(transport);

//   // Handle client disconnect
//   req.on('close', () => {
//     console.log('Client disconnected');
//   });
// });

// // Start the server
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
