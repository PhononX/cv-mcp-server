/**
 * MCP client over the Streamable HTTP transport, for testing a locally running
 * `npm run dev:http` / `dev:http:stateless`.
 *
 * Exposes the same `{ call, close }` interface as lib/mcp-stdio.mjs so the dev
 * CLI can target either.
 *
 * AUTH, and its limits. The HTTP transport requires a bearer token, and
 * `createOAuthTokenVerifier` (src/auth/auth.service.ts) uses `jwt.decode` —
 * NOT `jwt.verify`. It only requires the token to be a decodable JWT carrying
 * `sub`, `client_id`, and the `mcp:read` + `mcp:write` scopes; the SDK
 * middleware additionally enforces `exp`. So a locally minted token gets you
 * through the protocol layer with no OAuth round trip.
 *
 * That is enough to exercise the transport, sessions, tools/list and schema
 * shape. It is NOT enough for tool calls that touch data: the token is
 * forwarded verbatim to cv-api as `Authorization: Bearer <token>`, and cv-api
 * does validate it, so a minted token gets a 401 there. For real data over
 * HTTP you need a genuine OAuth access token (pass it with --token).
 *
 * This is not an auth bypass: cv-api is the authority, session ids are random
 * UUIDs rather than derived from claims, and rate limiting is IP-based. The
 * only thing a forged token buys is a forged `sub`/`client_id` in this
 * server's logs and session context.
 */
import jwt from 'jsonwebtoken';

/** Scopes the HTTP transport requires — src/transports/http/constants.ts. */
const REQUIRED_SCOPES = ['mcp:read', 'mcp:write'];

export const mintLocalToken = ({
  sub = 'local-test-user',
  clientId = 'local-test-client',
  ttlSeconds = 3600,
} = {}) =>
  jwt.sign(
    {
      sub,
      client_id: clientId,
      scope: REQUIRED_SCOPES.join(' '),
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    },
    // The signature is never checked, so the secret is arbitrary. Named to
    // make that explicit at the call site rather than looking like a real key.
    'signature-is-not-verified-by-this-server',
  );

/** Streamable HTTP may answer as JSON or as an SSE frame; handle both. */
const parseBody = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const candidates = trimmed
    .split('\n')
    .map((l) => (l.startsWith('data:') ? l.slice(5).trim() : l.trim()))
    .filter((l) => l.startsWith('{'));
  for (const line of candidates.reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      /* keep looking */
    }
  }
  return undefined;
};

export const connectHttp = async ({ url, token, timeoutMs = 60_000 } = {}) => {
  const bearer = token ?? mintLocalToken();
  let sessionId;
  let nextId = 1;

  const post = async (payload) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const returned = res.headers.get('mcp-session-id');
    if (returned) sessionId = returned;

    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `${res.status} from ${url}: ${text.slice(0, 200)}\n` +
          'The HTTP transport needs a bearer token with the mcp:read and ' +
          'mcp:write scopes.',
      );
    }
    return parseBody(text);
  };

  const call = async (method, params = {}) => {
    const body = await post({
      jsonrpc: '2.0',
      id: nextId++,
      method,
      params,
    });
    return body ?? {};
  };

  const init = await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'cv-mcp-dev-http', version: '1.0.0' },
  });
  if (!init.result) {
    throw new Error(
      `initialize failed against ${url}: ${JSON.stringify(init).slice(0, 200)}`,
    );
  }
  // Notification: no id, no response expected.
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' });

  return {
    call,
    /**
     * Terminate the server-side session. The stateful transport allocates one
     * per `initialize` and otherwise holds it until MCP_SESSION_TTL_MS (1h)
     * expires, so a no-op here left a session behind on every CLI invocation.
     * Best effort: a failed cleanup should not fail the command, since the
     * session does eventually expire on its own.
     */
    close: async () => {
      if (!sessionId) return;
      try {
        await fetch(url, {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${bearer}`,
            'mcp-session-id': sessionId,
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        /* best effort */
      }
      sessionId = undefined;
    },
    sessionId: () => sessionId,
    usingMintedToken: !token,
  };
};
