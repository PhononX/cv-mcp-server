import http from 'node:http';
import { File } from 'node:buffer';

/**
 * These go through the real generated client, the real `mutator` and the real
 * axios instance — only the destination is a local server that reports what
 * actually arrived. Mocking axios would have hidden the bug this guards: the
 * defect was in how the two header sets combine, and it only shows up in the
 * bytes on the wire.
 */
describe('mutator header merging', () => {
  let server: http.Server;
  let seen: {
    headers: http.IncomingHttpHeaders;
    body: string;
  };

  const call = async (
    fn: (
      api: Record<string, (...a: unknown[]) => Promise<unknown>>,
    ) => Promise<unknown>,
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCarbonVoiceSimplifiedAPI } = require('../../../src/generated');
    return fn(getCarbonVoiceSimplifiedAPI());
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      // binary so the multipart payload survives inspection
      req.on('data', (c) => (body += c.toString('binary')));
      req.on('end', () => {
        seen = { headers: req.headers, body };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as { port: number };
    process.env.CARBON_VOICE_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.CARBON_VOICE_API_KEY = 'instance-default-key';
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // The regression: `...options` used to replace the generated headers
  // wholesale, dropping `Content-Type: multipart/form-data`. Under the
  // instance's `application/json` default axios then ran the FormData through
  // `formDataToJSON`, so the File serialized to `{}` and the audio bytes never
  // left the process — the upload feature was inert.
  it('keeps the multipart content type when auth options are supplied', async () => {
    const file = new File([Buffer.from('ID3-audio-bytes')], 'memo.mp3', {
      type: 'audio/mpeg',
    });

    await call((api) =>
      api.createVoiceMemoMessage(
        { transcript: 'hello', audio_file: file },
        { headers: { Authorization: 'Bearer tok', 'x-api-key': undefined } },
      ),
    );

    expect(seen.headers['content-type']).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    expect(seen.body).toContain('filename="memo.mp3"');
    expect(seen.body).toContain('ID3-audio-bytes');
  });

  it('still applies the auth header from options', async () => {
    const file = new File([Buffer.from('x')], 'memo.mp3', {
      type: 'audio/mpeg',
    });

    await call((api) =>
      api.createVoiceMemoMessage(
        { audio_file: file },
        { headers: { Authorization: 'Bearer tok', 'x-api-key': undefined } },
      ),
    );

    expect(seen.headers.authorization).toBe('Bearer tok');
  });

  // cv-api tries `api-key` BEFORE `pat-token`, so a request carrying both would
  // let the instance's API key win and silently discard the bearer's scopes.
  // Merging must not resurrect the instance default.
  it('lets options suppress an instance default header with undefined', async () => {
    const file = new File([Buffer.from('x')], 'memo.mp3', {
      type: 'audio/mpeg',
    });

    await call((api) =>
      api.createVoiceMemoMessage(
        { audio_file: file },
        { headers: { Authorization: 'Bearer tok', 'x-api-key': undefined } },
      ),
    );

    expect(seen.headers['x-api-key']).toBeUndefined();
  });

  it('sends the instance default api key when options do not clear it', async () => {
    await call((api) =>
      api.listMessages({}, { headers: { 'x-api-key': 'per-request-key' } }),
    );

    expect(seen.headers['x-api-key']).toBe('per-request-key');
  });

  it('leaves a plain JSON request as JSON', async () => {
    await call((api) =>
      api.createFolder(
        { name: 'f' },
        { headers: { Authorization: 'Bearer tok' } },
      ),
    );

    expect(seen.headers['content-type']).toMatch(/^application\/json/);
    expect(JSON.parse(seen.body)).toEqual({ name: 'f' });
  });
});
