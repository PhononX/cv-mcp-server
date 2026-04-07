describe('SessionConfig.fromEnv', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('should map MCP_SESSION_* env values into SessionConfig fields', () => {
    jest.doMock('../../../../../src/config', () => ({
      env: {
        MCP_SESSION_TTL_MS: 1234,
        MCP_SESSION_MAX_SESSIONS: 42,
        MCP_SESSION_CLEANUP_INTERVAL_MS: 5678,
        MCP_SESSION_MAX_AGE_MS: 91011,
      },
    }));

    let SessionConfigCtor: any;
    jest.isolateModules(() => {
      ({ SessionConfig: SessionConfigCtor } = require('../../../../../src/transports/http/session/session.config'));
    });

    const config = SessionConfigCtor.fromEnv();

    expect(config.ttlMs).toBe(1234);
    expect(config.maxSessions).toBe(42);
    expect(config.cleanupIntervalMs).toBe(5678);
    expect(config.maxWallClockAgeMs).toBe(91011);
  });
});
