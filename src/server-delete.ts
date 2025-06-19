// import { z } from 'zod';
// import { zodToJsonSchema } from 'zod-to-json-schema';

// import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// import {
//   CallToolRequestSchema,
//   CompleteRequestSchema,
//   CreateMessageRequest,
//   CreateMessageResultSchema,
//   GetPromptRequestSchema,
//   ListPromptsRequestSchema,
//   ListResourcesRequestSchema,
//   ListResourceTemplatesRequestSchema,
//   ListToolsRequestSchema,
//   LoggingLevel,
//   ReadResourceRequestSchema,
//   Resource,
//   SetLevelRequestSchema,
//   SubscribeRequestSchema,
//   Tool,
//   ToolSchema,
//   UnsubscribeRequestSchema,
// } from '@modelcontextprotocol/sdk/types.js';

// const ToolInputSchema = ToolSchema.shape.inputSchema;
// type ToolInput = z.infer<typeof ToolInputSchema>;

// /* Input schemas for tools implemented in this server */
// const EchoSchema = z.object({
//   message: z.string().describe('Message to echo'),
// });

// const AddSchema = z.object({
//   a: z.number().describe('First number'),
//   b: z.number().describe('Second number'),
// });

// const LongRunningOperationSchema = z.object({
//   duration: z
//     .number()
//     .default(10)
//     .describe('Duration of the operation in seconds'),
//   steps: z.number().default(5).describe('Number of steps in the operation'),
// });

// const PrintEnvSchema = z.object({});

// const SampleLLMSchema = z.object({
//   prompt: z.string().describe('The prompt to send to the LLM'),
//   maxTokens: z
//     .number()
//     .default(100)
//     .describe('Maximum number of tokens to generate'),
// });

// // Example completion values
// const EXAMPLE_COMPLETIONS = {
//   style: ['casual', 'formal', 'technical', 'friendly'],
//   temperature: ['0', '0.5', '0.7', '1.0'],
//   resourceId: ['1', '2', '3', '4', '5'],
// };

// const GetTinyImageSchema = z.object({});

// const AnnotatedMessageSchema = z.object({
//   messageType: z
//     .enum(['error', 'success', 'debug'])
//     .describe('Type of message to demonstrate different annotation patterns'),
//   includeImage: z
//     .boolean()
//     .default(false)
//     .describe('Whether to include an example image'),
// });

// const GetResourceReferenceSchema = z.object({
//   resourceId: z
//     .number()
//     .min(1)
//     .max(100)
//     .describe('ID of the resource to reference (1-100)'),
// });

// enum ToolName {
//   ECHO = 'echo',
//   ADD = 'add',
//   LONG_RUNNING_OPERATION = 'longRunningOperation',
//   PRINT_ENV = 'printEnv',
//   SAMPLE_LLM = 'sampleLLM',
//   GET_TINY_IMAGE = 'getTinyImage',
//   ANNOTATED_MESSAGE = 'annotatedMessage',
//   GET_RESOURCE_REFERENCE = 'getResourceReference',
// }

// enum PromptName {
//   SIMPLE = 'simple_prompt',
//   COMPLEX = 'complex_prompt',
//   RESOURCE = 'resource_prompt',
// }

// export const createServer = () => {
//   const server = new Server(
//     {
//       name: 'example-servers/everything',
//       version: '1.0.0',
//     },
//     {
//       capabilities: {
//         prompts: {},
//         resources: { subscribe: true },
//         tools: {},
//         logging: {},
//         completions: {},
//       },
//     },
//   );

//   const subscriptions: Set<string> = new Set();
//   let subsUpdateInterval: NodeJS.Timeout | undefined;
//   let stdErrUpdateInterval: NodeJS.Timeout | undefined;

//   // Set up update interval for subscribed resources
//   subsUpdateInterval = setInterval(() => {
//     for (const uri of subscriptions) {
//       server.notification({
//         method: 'notifications/resources/updated',
//         params: { uri },
//       });
//     }
//   }, 10000);

//   let logLevel: LoggingLevel = 'debug';
//   let logsUpdateInterval: NodeJS.Timeout | undefined;
//   const messages = [
//     { level: 'debug', data: 'Debug-level message' },
//     { level: 'info', data: 'Info-level message' },
//     { level: 'notice', data: 'Notice-level message' },
//     { level: 'warning', data: 'Warning-level message' },
//     { level: 'error', data: 'Error-level message' },
//     { level: 'critical', data: 'Critical-level message' },
//     { level: 'alert', data: 'Alert level-message' },
//     { level: 'emergency', data: 'Emergency-level message' },
//   ];

//   const isMessageIgnored = (level: LoggingLevel): boolean => {
//     const currentLevel = messages.findIndex((msg) => logLevel === msg.level);
//     const messageLevel = messages.findIndex((msg) => level === msg.level);
//     return messageLevel < currentLevel;
//   };

//   // Set up update interval for random log messages
//   logsUpdateInterval = setInterval(() => {
//     const message = {
//       method: 'notifications/message',
//       params: messages[Math.floor(Math.random() * messages.length)],
//     };
//     if (!isMessageIgnored(message.params.level as LoggingLevel))
//       server.notification(message);
//   }, 20000);

//   // Set up update interval for stderr messages
//   stdErrUpdateInterval = setInterval(() => {
//     const shortTimestamp = new Date().toLocaleTimeString([], {
//       hour: '2-digit',
//       minute: '2-digit',
//       second: '2-digit',
//     });
//     server.notification({
//       method: 'notifications/stderr',
//       params: { content: `${shortTimestamp}: A stderr message` },
//     });
//   }, 30000);

//   // Helper method to request sampling from client
//   const requestSampling = async (
//     context: string,
//     uri: string,
//     maxTokens: number = 100,
//   ) => {
//     const request: CreateMessageRequest = {
//       method: 'sampling/createMessage',
//       params: {
//         messages: [
//           {
//             role: 'user',
//             content: {
//               type: 'text',
//               text: `Resource ${uri} context: ${context}`,
//             },
//           },
//         ],
//         systemPrompt: 'You are a helpful test server.',
//         maxTokens,
//         temperature: 0.7,
//         includeContext: 'thisServer',
//       },
//     };

//     return await server.request(request, CreateMessageResultSchema);
//   };

//   const ALL_RESOURCES: Resource[] = Array.from({ length: 100 }, (_, i) => {
//     const uri = `test://static/resource/${i + 1}`;
//     if (i % 2 === 0) {
//       return {
//         uri,
//         name: `Resource ${i + 1}`,
//         mimeType: 'text/plain',
//         text: `Resource ${i + 1}: This is a plaintext resource`,
//       };
//     } else {
//       const buffer = Buffer.from(`Resource ${i + 1}: This is a base64 blob`);
//       return {
//         uri,
//         name: `Resource ${i + 1}`,
//         mimeType: 'application/octet-stream',
//         blob: buffer.toString('base64'),
//       };
//     }
//   });

//   const PAGE_SIZE = 10;

//   server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
//     const cursor = request.params?.cursor;
//     let startIndex = 0;

//     if (cursor) {
//       const decodedCursor = parseInt(atob(cursor), 10);
//       if (!isNaN(decodedCursor)) {
//         startIndex = decodedCursor;
//       }
//     }

//     const endIndex = Math.min(startIndex + PAGE_SIZE, ALL_RESOURCES.length);
//     const resources = ALL_RESOURCES.slice(startIndex, endIndex);

//     let nextCursor: string | undefined;
//     if (endIndex < ALL_RESOURCES.length) {
//       nextCursor = btoa(endIndex.toString());
//     }

//     return {
//       resources,
//       nextCursor,
//     };
//   });

//   server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
//     return {
//       resourceTemplates: [
//         {
//           uriTemplate: 'test://static/resource/{id}',
//           name: 'Static Resource',
//           description: 'A static resource with a numeric ID',
//         },
//       ],
//     };
//   });

//   server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
//     const uri = request.params.uri;

//     if (uri.startsWith('test://static/resource/')) {
//       const index = parseInt(uri.split('/').pop() ?? '', 10) - 1;
//       if (index >= 0 && index < ALL_RESOURCES.length) {
//         const resource = ALL_RESOURCES[index];
//         return {
//           contents: [resource],
//         };
//       }
//     }

//     throw new Error(`Unknown resource: ${uri}`);
//   });

//   server.setRequestHandler(SubscribeRequestSchema, async (request) => {
//     const { uri } = request.params;
//     subscriptions.add(uri);

//     // Request sampling from client when someone subscribes
//     await requestSampling('A new subscription was started', uri);
//     return {};
//   });

//   server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
//     subscriptions.delete(request.params.uri);
//     return {};
//   });

//   server.setRequestHandler(ListPromptsRequestSchema, async () => {
//     return {
//       prompts: [
//         {
//           name: PromptName.SIMPLE,
//           description: 'A prompt without arguments',
//         },
//         {
//           name: PromptName.COMPLEX,
//           description: 'A prompt with arguments',
//           arguments: [
//             {
//               name: 'temperature',
//               description: 'Temperature setting',
//               required: true,
//             },
//             {
//               name: 'style',
//               description: 'Output style',
//               required: false,
//             },
//           ],
//         },
//         {
//           name: PromptName.RESOURCE,
//           description: 'A prompt that includes an embedded resource reference',
//           arguments: [
//             {
//               name: 'resourceId',
//               description: 'Resource ID to include (1-100)',
//               required: true,
//             },
//           ],
//         },
//       ],
//     };
//   });

//   server.setRequestHandler(GetPromptRequestSchema, async (request) => {
//     const { name, arguments: args } = request.params;

//     if (name === PromptName.SIMPLE) {
//       return {
//         messages: [
//           {
//             role: 'user',
//             content: {
//               type: 'text',
//               text: 'This is a simple prompt without arguments.',
//             },
//           },
//         ],
//       };
//     }

//     if (name === PromptName.COMPLEX) {
//       return {
//         messages: [
//           {
//             role: 'user',
//             content: {
//               type: 'text',
//               text: `This is a complex prompt with arguments: temperature=${args?.temperature}, style=${args?.style}`,
//             },
//           },
//           {
//             role: 'assistant',
//             content: {
//               type: 'text',
//               text: "I understand. You've provided a complex prompt with temperature and style arguments.
// How would you like me to proceed?",
//             },
//           },
//           {
//             role: 'user',
//             content: {
//               type: 'image',
//               data: MCP_TINY_IMAGE,
//               mimeType: 'image/png',
//             },
//           },
//         ],
//       };
//     }

//     if (name === PromptName.RESOURCE) {
//       const resourceId = parseInt(args?.resourceId as string, 10);
//       if (isNaN(resourceId) || resourceId < 1 || resourceId > 100) {
//         throw new Error(
//           `Invalid resourceId: ${args?.resourceId}. Must be a number between 1 and 100.`,
//         );
//       }

//       const resourceIndex = resourceId - 1;
//       const resource = ALL_RESOURCES[resourceIndex];

//       return {
//         messages: [
//           {
//             role: 'user',
//             content: {
//               type: 'text',
//               text: `This prompt includes Resource ${resourceId}. Please analyze the following resource:`,
//             },
//           },
//           {
//             role: 'user',
//             content: {
//               type: 'resource',
//               resource: resource,
//             },
//           },
//         ],
//       };
//     }

//     throw new Error(`Unknown prompt: ${name}`);
//   });

//   server.setRequestHandler(ListToolsRequestSchema, async () => {
//     const tools: Tool[] = [
//       {
//         name: ToolName.ECHO,
//         description: 'Echoes back the input',
//         inputSchema: zodToJsonSchema(EchoSchema) as ToolInput,
//       },
//       {
//         name: ToolName.ADD,
//         description: 'Adds two numbers',
//         inputSchema: zodToJsonSchema(AddSchema) as ToolInput,
//       },
//       {
//         name: ToolName.PRINT_ENV,
//         description:
//           'Prints all environment variables, helpful for debugging MCP server configuration',
//         inputSchema: zodToJsonSchema(PrintEnvSchema) as ToolInput,
//       },
//       {
//         name: ToolName.LONG_RUNNING_OPERATION,
//         description:
//           'Demonstrates a long running operation with progress updates',
//         inputSchema: zodToJsonSchema(LongRunningOperationSchema) as ToolInput,
//       },
//       {
//         name: ToolName.SAMPLE_LLM,
//         description: "Samples from an LLM using MCP's sampling feature",
//         inputSchema: zodToJsonSchema(SampleLLMSchema) as ToolInput,
//       },
//       {
//         name: ToolName.GET_TINY_IMAGE,
//         description: 'Returns the MCP_TINY_IMAGE',
//         inputSchema: zodToJsonSchema(GetTinyImageSchema) as ToolInput,
//       },
//       {
//         name: ToolName.ANNOTATED_MESSAGE,
//         description:
//           'Demonstrates how annotations can be used to provide metadata about content',
//         inputSchema: zodToJsonSchema(AnnotatedMessageSchema) as ToolInput,
//       },
//       {
//         name: ToolName.GET_RESOURCE_REFERENCE,
//         description:
//           'Returns a resource reference that can be used by MCP clients',
//         inputSchema: zodToJsonSchema(GetResourceReferenceSchema) as ToolInput,
//       },
//     ];

//     return { tools };
//   });

//   server.setRequestHandler(CallToolRequestSchema, async (request) => {
//     const { name, arguments: args } = request.params;

//     if (name === ToolName.ECHO) {
//       const validatedArgs = EchoSchema.parse(args);
//       return {
//         content: [{ type: 'text', text: `Echo: ${validatedArgs.message}` }],
//       };
//     }

//     if (name === ToolName.ADD) {
//       const validatedArgs = AddSchema.parse(args);
//       const sum = validatedArgs.a + validatedArgs.b;
//       return {
//         content: [
//           {
//             type: 'text',
//             text: `The sum of ${validatedArgs.a} and ${validatedArgs.b} is ${sum}.`,
//           },
//         ],
//       };
//     }

//     if (name === ToolName.LONG_RUNNING_OPERATION) {
//       const validatedArgs = LongRunningOperationSchema.parse(args);
//       const { duration, steps } = validatedArgs;
//       const stepDuration = duration / steps;
//       const progressToken = request.params._meta?.progressToken;

//       for (let i = 1; i < steps + 1; i++) {
//         await new Promise((resolve) =>
//           setTimeout(resolve, stepDuration * 1000),
//         );

//         if (progressToken !== undefined) {
//           await server.notification({
//             method: 'notifications/progress',
//             params: {
//               progress: i,
//               total: steps,
//               progressToken,
//             },
//           });
//         }
//       }

//       return {
//         content: [
//           {
//             type: 'text',
//             text: `Long running operation completed. Duration: ${duration} seconds, Steps: ${steps}.`,
//           },
//         ],
//       };
//     }

//     if (name === ToolName.PRINT_ENV) {
//       return {
//         content: [
//           {
//             type: 'text',
//             text: JSON.stringify(process.env, null, 2),
//           },
//         ],
//       };
//     }

//     if (name === ToolName.SAMPLE_LLM) {
//       const validatedArgs = SampleLLMSchema.parse(args);
//       const { prompt, maxTokens } = validatedArgs;

//       const result = await requestSampling(
//         prompt,
//         ToolName.SAMPLE_LLM,
//         maxTokens,
//       );
//       return {
//         content: [
//           { type: 'text', text: `LLM sampling result: ${result.content.text}` },
//         ],
//       };
//     }

//     if (name === ToolName.GET_TINY_IMAGE) {
//       GetTinyImageSchema.parse(args);
//       return {
//         content: [
//           {
//             type: 'text',
//             text: 'This is a tiny image:',
//           },
//           {
//             type: 'image',
//             data: MCP_TINY_IMAGE,
//             mimeType: 'image/png',
//           },
//           {
//             type: 'text',
//             text: 'The image above is the MCP tiny image.',
//           },
//         ],
//       };
//     }

//     if (name === ToolName.GET_RESOURCE_REFERENCE) {
//       const validatedArgs = GetResourceReferenceSchema.parse(args);
//       const resourceId = validatedArgs.resourceId;

//       const resourceIndex = resourceId - 1;
//       if (resourceIndex < 0 || resourceIndex >= ALL_RESOURCES.length) {
//         throw new Error(`Resource with ID ${resourceId} does not exist`);
//       }

//       const resource = ALL_RESOURCES[resourceIndex];

//       return {
//         content: [
//           {
//             type: 'text',
//             text: `Returning resource reference for Resource ${resourceId}:`,
//           },
//           {
//             type: 'resource',
//             resource: resource,
//           },
//           {
//             type: 'text',
//             text: `You can access this resource using the URI: ${resource.uri}`,
//           },
//         ],
//       };
//     }

//     if (name === ToolName.ANNOTATED_MESSAGE) {
//       const { messageType, includeImage } = AnnotatedMessageSchema.parse(args);

//       const content = [];

//       // Main message with different priorities/audiences based on type
//       if (messageType === 'error') {
//         content.push({
//           type: 'text',
//           text: 'Error: Operation failed',
//           annotations: {
//             priority: 1.0, // Errors are highest priority
//             audience: ['user', 'assistant'], // Both need to know about errors
//           },
//         });
//       } else if (messageType === 'success') {
//         content.push({
//           type: 'text',
//           text: 'Operation completed successfully',
//           annotations: {
//             priority: 0.7, // Success messages are important but not critical
//             audience: ['user'], // Success mainly for user consumption
//           },
//         });
//       } else if (messageType === 'debug') {
//         content.push({
//           type: 'text',
//           text: 'Debug: Cache hit ratio 0.95, latency 150ms',
//           annotations: {
//             priority: 0.3, // Debug info is low priority
//             audience: ['assistant'], // Technical details for assistant
//           },
//         });
//       }

//       // Optional image with its own annotations
//       if (includeImage) {
//         content.push({
//           type: 'image',
//           data: MCP_TINY_IMAGE,
//           mimeType: 'image/png',
//           annotations: {
//             priority: 0.5,
//             audience: ['user'], // Images primarily for user visualization
//           },
//         });
//       }

//       return { content };
//     }

//     throw new Error(`Unknown tool: ${name}`);
//   });

//   server.setRequestHandler(CompleteRequestSchema, async (request) => {
//     const { ref, argument } = request.params;

//     if (ref.type === 'ref/resource') {
//       const resourceId = ref.uri.split('/').pop();
//       if (!resourceId) return { completion: { values: [] } };

//       // Filter resource IDs that start with the input value
//       const values = EXAMPLE_COMPLETIONS.resourceId.filter((id) =>
//         id.startsWith(argument.value),
//       );
//       return { completion: { values, hasMore: false, total: values.length } };
//     }

//     if (ref.type === 'ref/prompt') {
//       // Handle completion for prompt arguments
//       const completions =
//         EXAMPLE_COMPLETIONS[argument.name as keyof typeof EXAMPLE_COMPLETIONS];
//       if (!completions) return { completion: { values: [] } };

//       const values = completions.filter((value) =>
//         value.startsWith(argument.value),
//       );
//       return { completion: { values, hasMore: false, total: values.length } };
//     }

//     throw new Error(`Unknown reference type`);
//   });

//   server.setRequestHandler(SetLevelRequestSchema, async (request) => {
//     const { level } = request.params;
//     logLevel = level;

//     // Demonstrate different log levels
//     await server.notification({
//       method: 'notifications/message',
//       params: {
//         level: 'debug',
//         logger: 'test-server',
//         data: `Logging level set to: ${logLevel}`,
//       },
//     });

//     return {};
//   });

//   const cleanup = async () => {
//     if (subsUpdateInterval) clearInterval(subsUpdateInterval);
//     if (logsUpdateInterval) clearInterval(logsUpdateInterval);
//     if (stdErrUpdateInterval) clearInterval(stdErrUpdateInterval);
//   };

//   return { server, cleanup };
// };
