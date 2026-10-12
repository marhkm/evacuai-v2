// Build-time default. A runtime "Server URL" field for test builds comes with the auth slice.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
