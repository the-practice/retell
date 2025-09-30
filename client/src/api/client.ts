import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Agent endpoints
export const createAgent = async () => {
  const response = await apiClient.post('/agents');
  return response.data;
};

export const createWebCall = async (agentId: string, metadata?: any) => {
  const response = await apiClient.post(`/agents/${agentId}/authorize`, { metadata });
  return response.data;
};

export const listCalls = async (limit: number = 50) => {
  const response = await apiClient.get('/calls', { params: { limit } });
  return response.data;
};

export const getCacheStats = async () => {
  const response = await apiClient.get('/cache/stats');
  return response.data;
};

export const retryFailedSyncs = async () => {
  const response = await apiClient.post('/cache/retry-failed');
  return response.data;
};

export default apiClient;