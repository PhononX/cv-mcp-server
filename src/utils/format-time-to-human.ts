/**
 * Formats time in seconds to a human-readable string
 * @param timeSeconds - Time in seconds
 * @returns Human-readable time string (e.g., "35s", "1h 36m", "2d 13h 14m 35s")
 */
export const formatTimeToHuman = (timeSeconds: number): string => {
  if (timeSeconds < 60) {
    return `${Math.floor(timeSeconds)}s`;
  }

  const days = Math.floor(timeSeconds / 86400);
  const hours = Math.floor((timeSeconds % 86400) / 3600);
  const minutes = Math.floor((timeSeconds % 3600) / 60);
  const seconds = Math.floor(timeSeconds % 60);

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
