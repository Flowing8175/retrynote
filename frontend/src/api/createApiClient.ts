import axios, { type AxiosInstance } from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function createApiClient(): AxiosInstance {
  return axios.create({ baseURL: API_BASE_URL });
}
