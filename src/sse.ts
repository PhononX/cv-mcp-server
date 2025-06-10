// #!/usr/bin/env node
// import express, { Request, Response } from 'express';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// import { z } from 'zod';
// import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// // Load .env
// dotenv.config();

// // Environment variables
// const CV_API_BASE_URL = 'https://wf5whhzd-8081.brs.devtunnels.ms';
// const CV_API_SIMPLIFIED_BASE_URL = `${CV_API_BASE_URL}/simplified`;
// const API_KEY = process.env.CARBON_VOICE_API_KEY;

// if (!API_KEY) {
//   console.error('❌ Missing CARBON_VOICE_API_KEY');
//   process.exit(1);
// }

// // ---- API CLIENT ---- //
// class CarbonVoiceClient {
//   constructor(private apiKey: string) {}

//   async listChannels(limit = 100, cursor = '') {
//     try {
//       const res = await fetch(
//         `${CV_API_SIMPLIFIED_BASE_URL}/conversations/all`,
//         {
//           headers: {
//             'x-api-key': this.apiKey,
//             'Content-Type': 'application/json',
//           },
//         },
//       );

//       if (!res.ok) throw new Error(`Failed with status ${res.status}`);
//       return await res.json();
//     } catch (error) {
//       console.error('🔴 Error in listChannels:', error);
//       return null;
//     }
//   }
// }

// const client = new CarbonVoiceClient(API_KEY);

// // ---- MCP SERVER ---- //
// const server = new McpServer({
//   name: 'Carbon Voice MCP Server (SSE)',
//   version: '1.0.0',
//   capabilities: {
//     resources: {},
//     tools: {},
//   },
// });

// server.tool(
//   'list_channels',
//   'List channels',
//   {
//     workspace_id: z.string().optional().describe('Carbon Voice workspace ID'),
//   },
//   async ({ workspace_id }) => {
//     const channelsData = await client.listChannels(100, '');

//     if (!channelsData) {
//       return {
//         content: [
//           {
//             type: 'text',
//             text: 'Failed to retrieve channels data',
//           },
//         ],
//       };
//     }

//     return {
//       content: [
//         {
//           type: 'text',
//           text: JSON.stringify(channelsData),
//         },
//       ],
//     };
//   },
// );

// // ---- EXPRESS + SSE ---- //
// async function run() {
//   const app = express();
//   app.use(cors());
//   app.use(express.json());
//   const transports = new Map<string, SSEServerTransport>();

//   app.get('/mcp/stream', async (req: Request, res: Response) => {
//     const clientId = crypto.randomUUID();
//     const transport = new SSEServerTransport('/mcp/stream', res);
//     transports.set(clientId, transport);

//     // Connect the SSE transport (this writes SSE headers) BEFORE writing any response
//     await server.connect(transport);

//     // Send a "clientId" event (so the client knows its ID)
//     res.write(`event: clientId\ndata: ${clientId}\n\n`);

//     // Send a "list_tools" event (so the client sees available tools) – mimicking MCP protocol's tool discovery
//     const toolsList = {
//       type: 'list_tools',
//       tools: [
//         {
//           name: 'list_channels',
//           description: 'List channels',
//           args_schema: { workspace_id: 'string (optional)' },
//         },
//       ],
//     };
//     res.write(`event: list_tools\ndata: ${JSON.stringify(toolsList)}\n\n`);

//     req.on('close', () => transports.delete(clientId));

//     console.log('✅ SSE MCP server connected (transport started)');
//   });

//   app.post('/mcp/message', async (req: any, res: any) => {
//     // if (!transport) {
//     //   return res.status(400).send('❌ SSE transport not initialized');
//     // }
//     // await transport.handlePostMessage(req, res, req.body);

//     const { clientId, ...body } = req.body;
//     const transport = transports.get(clientId);
//     if (!transport) {
//       return res.status(400).send('❌ SSE connection not established');
//     }
//     try {
//       return await transport.handlePostMessage(req, res, body);
//     } catch (error) {
//       console.error('🔴 Error in handlePostMessage:', error);
//       return res.status(500).send('❌ Error processing message');
//     }
//   });

//   const PORT = process.env.PORT ?? 3333;
//   app.listen(PORT, () =>
//     console.log(`✅ SSE MCP server listening at http://localhost:${PORT}/mcp`),
//   );
// }

// run().catch((err) => {
//   console.error('🛑 Fatal server error:', err);
//   process.exit(1);
// });
