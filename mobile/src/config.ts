// Build-time default. A runtime "Server URL" field for test builds comes with the auth slice.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

// Test builds (students, local Docker): server address field and the pressure-trace recorder. Production builds set it to 'false'.
export const TEST_BUILD = process.env.EXPO_PUBLIC_SHOW_SERVER_SETTING !== 'false';
