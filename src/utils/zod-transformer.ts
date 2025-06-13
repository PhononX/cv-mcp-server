import { generateZodClientFromOpenAPI } from 'openapi-zod-client';

const transformer = async (args: any) => {
  if (!args || !args.schema) {
    throw new Error(
      'Transformer received undefined or missing schema! Args: ' +
        JSON.stringify(args),
    );
  }
  if (!args.path) {
    throw new Error(
      'Transformer received undefined or missing path! Args: ' +
        JSON.stringify(args),
    );
  }
  return generateZodClientFromOpenAPI({
    openApiDoc: args.schema,
    distPath: args.path,
  });
};

// Use both CommonJS and ESM exports for compatibility
module.exports = transformer;
export default transformer;
