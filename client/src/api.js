const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export function getAuthToken() {
  return localStorage.getItem('krushi_token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('krushi_token', token);
  } else {
    localStorage.removeItem('krushi_token');
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        if (endpoint !== '/auth/login') {
          // Token expired or invalid
          console.warn('Session expired or unauthorized');
        }
      }
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err.message);
    throw err;
  }
}
