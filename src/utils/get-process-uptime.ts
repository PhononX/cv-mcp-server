import { timeToHuman } from './time-to-human';

/**
 * Formats process uptime to a human-readable string
 * @returns Human-readable uptime string
 */
export const getProcessUptime = (): string => {
  return timeToHuman(process.uptime(), 's');
};
