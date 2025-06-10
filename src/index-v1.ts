// #!/usr/bin/env node
// import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// import {
//   CallToolRequest,
//   CallToolRequestSchema,
//   ListToolsRequestSchema,
//   Tool,
// } from '@modelcontextprotocol/sdk/types.js';
// import { z } from 'zod';
// import { CarbonVoiceClient } from './carbon-voice.js';

// /**
//  * Environment variables
//  */
// const CV_API_BASE_URL = 'https://wf5whhzd-8081.brs.devtunnels.ms';
// const CV_API_SIMPLIFIED_BASE_URL = `${CV_API_BASE_URL}/simplified`;
// const USER_AGENT = 'carbonvoice-app/1.0';

// // Type definitions for tool arguments
// interface ListConversationArgs {
//   limit?: number;
//   cursor?: string;
// }

// const apiKey = process.env.CARBON_VOICE_API_KEY;

// if (!apiKey) {
//   console.error('Please set CARBON_VOICE_API_KEY environment variable');
//   process.exit(1);
// }

// // Carbon Voice Client
// const client = new CarbonVoiceClient(apiKey);

// console.error('Starting Carbon Voice MCP Server...');
// // Create server instance
// const server = new McpServer({
//   name: 'Carbon Voice MCP Server',
//   version: '1.0.0',
//   capabilities: {
//     resources: {},
//     tools: {},
//   },
// });

// server.tool(
//   'list_all_conversations',
//   'List all conversations',
//   {
//     workspace_id: z.string().optional().describe('Carbon Voice workspace ID'),
//   },
//   async ({ workspace_id }) => {
//     const channelsData = await client.listAllConversations();

//     if (!channelsData) {
//       return {
//         content: [
//           {
//             type: 'text',
//             text: 'Failed to retrieve all conversations',
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

// async function runServer() {
//   const transport = new StdioServerTransport();
//   console.error('Connecting server to transport...');

//   await server.connect(transport);

//   console.error('Carbon Voice MCP Server running on stdio');
// }

// runServer().catch((error) => {
//   console.error('Fatal error in runServer():', error);
//   process.exit(1);
// });
