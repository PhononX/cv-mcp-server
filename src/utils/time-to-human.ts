/**
 * Formats time to a human-readable string
 * @param time - Time value
 * @param unit - Unit of the input time ('ms' for milliseconds, 's' for seconds)
 * @returns Human-readable time string (e.g., "73ms", "1s", "1m 5s", "1h 36m")
 */
export const timeToHuman = (time: number, unit: 'ms' | 's'): string => {
  if (!time) {
    return '';
  }

  // Convert to seconds if input is in milliseconds
  const timeSeconds = unit === 'ms' ? time / 1000 : time;

  // For times less than 1 second when input is milliseconds, show in milliseconds
  if (unit === 'ms' && timeSeconds < 1) {
    return `${time}ms`;
  }

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
