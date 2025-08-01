import { AuthenticatedRequest } from '../../../auth/interfaces';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
  clientId?: string;
  platform?: string;
  // MCP client information
  mcpClientName?: string;
  mcpClientVersion?: string;
}

/**
 * Extract basic client information from the request
 */
export const extractClientInfo = (req: AuthenticatedRequest): ClientInfo => {
  const userAgent = req.headers['user-agent'] as string;
  const clientId = req.auth?.clientId;
  const ip = getClientIp(req);
  const platform = extractPlatformFromUserAgent(userAgent);

  // Extract MCP client information from initialize request
  const mcpClientName = req.body?.params?.clientInfo?.name;
  const mcpClientVersion = req.body?.params?.clientInfo?.version;

  return {
    ip,
    userAgent,
    clientId,
    platform,
    mcpClientName,
    mcpClientVersion,
  };
};

/**
 * Get client IP address from request
 */
const getClientIp = (req: AuthenticatedRequest): string | undefined => {
  // Check various headers for IP address
  const forwardedFor = req.headers['x-forwarded-for'] as string;
  const realIp = req.headers['x-real-ip'] as string;
  const cfConnectingIp = req.headers['cf-connecting-ip'] as string;

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return req.ip || req.socket?.remoteAddress;
};

/**
 * Extract platform information from user agent
 */
const extractPlatformFromUserAgent = (
  userAgent?: string,
): string | undefined => {
  if (!userAgent) {
    return undefined;
  }

  const ua = userAgent.toLowerCase();

  // Node.js clients
  if (ua.includes('node')) {
    return 'nodejs';
  }

  // Desktop platforms
  if (ua.includes('windows')) {
    return 'windows';
  }

  if (ua.includes('mac') || ua.includes('darwin')) {
    return 'macos';
  }

  if (ua.includes('linux')) {
    return 'linux';
  }

  // Mobile platforms
  if (ua.includes('android')) {
    return 'android';
  }

  if (ua.includes('iphone') || ua.includes('ipad')) {
    return 'ios';
  }

  // Web browsers
  if (
    ua.includes('mozilla') ||
    ua.includes('chrome') ||
    ua.includes('safari') ||
    ua.includes('firefox')
  ) {
    return 'web';
  }

  return undefined;
};
