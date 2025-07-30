// Carbon Voice API health cache
export type ApiHealthStatus = {
  isHealthy: boolean;
  lastChecked: string;
  apiUrl: string;
  error?: string;
};
