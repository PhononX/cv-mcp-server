import { IncomingHttpHeaders } from 'http';

const AUTH_HEADERS = ['authorization', 'x-api-key'];

export const removeLastChars = (str: string) => {
  return str?.substring(0, str.length - 5) + '<omitted>';
};

export const obfuscateAuthHeaders = (
  headers: IncomingHttpHeaders,
): IncomingHttpHeaders => {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      AUTH_HEADERS.includes(key?.toLowerCase())
        ? removeLastChars(`${value}`)
        : value,
    ]),
  );
};
