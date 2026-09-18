const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export function getAuthToken() {
  return localStorage.getItem('krushi_token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('krushi_token', token);
  } else {
    localStorage.removeItem('krushi_token');
    localStorage.removeItem('krushi_active_tenant');
  }
}

export function getActiveTenantId() {
  return localStorage.getItem('krushi_active_tenant');
}

export function setActiveTenantId(tenantId) {
  if (tenantId) {
    localStorage.setItem('krushi_active_tenant', String(tenantId));
  } else {
    localStorage.removeItem('krushi_active_tenant');
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();
  const activeTenant = getActiveTenantId();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (activeTenant) {
    headers['x-tenant-id'] = activeTenant;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Server error (${response.status})`);
      }
      throw new Error('Backend server is unreachable or returned invalid response. Please verify backend is running and VITE_API_BASE_URL is configured.');
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        if (endpoint !== '/auth/login') {
          console.warn('Session expired or unauthorized');
        }
      }
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (err) {
    const message = err.name === 'TypeError' && err.message.includes('fetch')
      ? 'Cannot connect to backend server. Please check your internet connection or backend URL.'
      : err.message;
    console.error(`API Error [${endpoint}]:`, message);
    throw new Error(message);
  }
}

export default {
  getAuthToken,
  setAuthToken,
  getActiveTenantId,
  setActiveTenantId,
  apiRequest
};
