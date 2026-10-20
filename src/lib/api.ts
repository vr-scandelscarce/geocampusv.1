import type {
  User,
  CampusConfig,
  ClassSession,
  AttendanceRecord,
  OdRequest,
  SystemStats,
  CheckInRequest,
  CheckInResponse,
  UserRole,
} from '../types/index.js';

const TOKEN_KEY = 'geocampus_jwt_token';

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}

// Client Device Fingerprint (Bug 16)
export function getOrCreateDeviceId(): string {
  let devId = localStorage.getItem('geocampus_device_id');
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem('geocampus_device_id', devId);
  }
  return devId;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // Auth
  login: async (id: string, password: string, role: UserRole) => {
    const data = await request<{ token: string; user: User }>('/login', {
      method: 'POST',
      body: JSON.stringify({ id, password, role }),
    });
    setStoredToken(data.token);
    return data;
  },

  getCurrentUser: async () => {
    return request<{ user: User }>('/auth/me');
  },

  logout: () => {
    setStoredToken(null);
  },

  // Config
  getConfig: async () => {
    return request<CampusConfig>('/config');
  },

  updateConfig: async (config: Partial<CampusConfig>) => {
    return request<{ success: boolean; config: CampusConfig }>('/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  // Sessions
  createSession: async (course: string, durationSec: number = 60, autoRotate: boolean = false) => {
    return request<ClassSession>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ course, durationSec, autoRotate }),
    });
  },

  rotateSession: async (sessionId: number, course: string) => {
    return request<ClassSession>('/sessions/rotate', {
      method: 'POST',
      body: JSON.stringify({ sessionId, course }),
    });
  },

  getActiveSessions: async () => {
    return request<ClassSession[]>('/sessions/active');
  },

  getFacultyActiveSession: async () => {
    return request<{ session: ClassSession | null }>('/sessions/faculty-active');
  },

  // Attendance
  checkIn: async (payload: CheckInRequest) => {
    return request<CheckInResponse>('/checkin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAttendanceLogs: async () => {
    return request<AttendanceRecord[]>('/attendance');
  },

  getStats: async () => {
    return request<SystemStats>('/stats');
  },

  // OD Requests
  submitOd: async (reason: string, date: string, file?: File | null) => {
    const formData = new FormData();
    formData.append('reason', reason);
    formData.append('date', date);
    if (file) {
      formData.append('proof', file);
    }
    return request<{ success: boolean; request: OdRequest }>('/od', {
      method: 'POST',
      body: formData,
    });
  },

  getMyOdRequests: async () => {
    return request<OdRequest[]>('/od/mine');
  },

  getAllOdRequests: async () => {
    return request<OdRequest[]>('/od');
  },

  decideOd: async (id: number, decision: 'Approved' | 'Rejected', notes?: string) => {
    return request<{ success: boolean; request: OdRequest }>(`/od/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, notes }),
    });
  },

  // Admin Import / Export
  importAttendance: async (records: any[]) => {
    return request<{ total: number; imported: number; skipped: number; errors: string[] }>('/import', {
      method: 'POST',
      body: JSON.stringify({ records }),
    });
  },

  exportAttendance: async () => {
    return request<AttendanceRecord[]>('/export');
  },

  getAuditLogs: async () => {
    return request<any[]>('/audit-logs');
  },
};

