import { formatTimeToHuman } from './format-time-to-human';

/**
 * Formats process uptime to a human-readable string
 * @returns Human-readable uptime string
 */
export const formatProcessUptime = (): string => {
  return formatTimeToHuman(process.uptime());
};
