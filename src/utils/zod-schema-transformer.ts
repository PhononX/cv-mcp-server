import { z } from 'zod';
import { OpenAPIV3 } from 'openapi-types';

function generateZodSchema(schema: OpenAPIV3.SchemaObject): z.ZodType<any> {
  if (!schema) {
    return z.any();
  }

  switch (schema.type) {
    case 'string':
      return schema.enum
        ? z.enum(schema.enum as [string, ...string[]])
        : z.string();
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(generateZodSchema(schema.items as OpenAPIV3.SchemaObject));
    case 'object':
      if (schema.properties) {
        const shape: { [key: string]: z.ZodType<any> } = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
          const isRequired = schema.required?.includes(key);
          shape[key] = isRequired
            ? generateZodSchema(prop as OpenAPIV3.SchemaObject)
            : generateZodSchema(prop as OpenAPIV3.SchemaObject).optional();
        }
        return z.object(shape);
      }
      return z.record(z.any());
    default:
      return z.any();
  }
}

export const transformer = async (args: any) => {
  if (!args || !args.schema) {
    throw new Error(
      'Transformer received undefined or missing schema! Args: ' +
        JSON.stringify(args),
    );
  }

  const schemas: { [key: string]: z.ZodType<any> } = {};

  // Process all schemas in the OpenAPI document
  if (args.schema.components?.schemas) {
    for (const [name, schema] of Object.entries(
      args.schema.components.schemas,
    )) {
      schemas[name] = generateZodSchema(schema as OpenAPIV3.SchemaObject);
    }
  }

  // Generate the output file content
  const output = `import { z } from 'zod';

// Generated Zod schemas
${Object.entries(schemas)
  .map(([name, schema]) => `export const ${name}Schema = ${schema.toString()};`)
  .join('\n')}

// Type exports
${Object.entries(schemas)
  .map(([name]) => `export type ${name} = z.infer<typeof ${name}Schema>;`)
  .join('\n')}
`;

  return output;
};

export default transformer;
