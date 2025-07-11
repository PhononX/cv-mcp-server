/**
 * Formats uptime in seconds to a human-readable string
 * @param uptimeSeconds - Uptime in seconds
 * @returns Human-readable uptime string (e.g., "35s", "1h 36m", "2d 13h 14m 35s")
 */
export const formatUptime = (uptimeSeconds: number): string => {
  if (uptimeSeconds < 60) {
    return `${Math.floor(uptimeSeconds)}s`;
  }

  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 && days === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
};

/**
 * Formats process uptime to a human-readable string
 * @returns Human-readable uptime string
 */
export const formatProcessUptime = (): string => {
  return formatUptime(process.uptime());
};
