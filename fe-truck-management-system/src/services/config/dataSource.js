const DEFAULT_DATA_SOURCE = 'api';
const DEFAULT_API_BASE_URL = 'http://localhost:3000/api';
const DEFAULT_AUTH_SOURCE = 'api';

const env = import.meta.env || {};

export const DATA_SOURCE = (env.VITE_DATA_SOURCE || DEFAULT_DATA_SOURCE).toLowerCase();
export const API_BASE_URL = (env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
export const AUTH_SOURCE = (env.VITE_AUTH_SOURCE || DEFAULT_AUTH_SOURCE).toLowerCase();

export function isApiDataSource() {
  return DATA_SOURCE === 'api';
}

export function isApiAuthSource() {
  return AUTH_SOURCE === 'api';
}
