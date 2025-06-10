export const SERVICE_NAME = 'Carbon Voice MCP Server';
export const SERVICE_VERSION = '1.0.0'; // TODO: Read it from package.json

// Carbon Voice API
const CV_API_BASE_URL =
  process.env.CV_API_BASE_URL || 'https://api.carbonvoice.app';
const CV_API_SIMPLIFIED_BASE_URL = `${CV_API_BASE_URL}/simplified`;
