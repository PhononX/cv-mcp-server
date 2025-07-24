import { Request, Response } from 'express';

import { env } from '../../../config';
import { REQUIRED_SCOPES } from '../constants';

export const oauthProtectedResource = (req: Request, res: Response) => {
  const protocol = req.get('X-Forwarded-Proto') || req.protocol;
  const host =
    req.get('X-Forwarded-Host') || req.get('host') || `localhost:${env.PORT}`;
  const baseUrl = `${protocol}://${host}`;

  res.json({
    resource: `${baseUrl}`,
    authorization_servers: [env.CARBON_VOICE_BASE_URL],
    scopes_supported: REQUIRED_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Carbon Voice MCP Server',
  });
};
