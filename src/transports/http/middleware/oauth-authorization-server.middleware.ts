import { Request, Response } from 'express';

import { env } from '../../../config';
import { REQUIRED_SCOPES } from '../constants';

export const oauthAuthorizationServer = (req: Request, res: Response) => {
  const issuer = env.CARBON_VOICE_BASE_URL;
  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    response_types_supported: ['code', 'token'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: REQUIRED_SCOPES,
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
    code_challenge_methods_supported: ['S256'], // PKCE support
  };

  res.json(metadata);
};
