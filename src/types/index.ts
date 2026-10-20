export type UserRole = 'student' | 'faculty' | 'admin';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  department?: string;
  email?: string;
}

export interface UserRecord extends User {
  password_hash: string;
}

export interface CampusConfig {
  id: number;
  campusName: string;
  lat: number;
  lon: number;
  radius: number; // in meters
  maxGpsAccuracy: number; // in meters
  allowToleranceMeters: number; // max 10m
}

export interface ClassSession {
  id: number;
  token: string;
  previous_token?: string;
  course: string;
  faculty_id: string;
  faculty_name: string;
  created_at: number;
  expires_at: number;
  is_active: boolean;
  auto_rotate: boolean;
}

export type AttendanceStatus =
  | 'Verified'
  | 'Rejected (Out of Bounds)'
  | 'Rejected (Weak GPS)'
  | 'Flagged (Shared Device)'
  | 'Flagged (Impossible Travel)'
  | 'Flagged (Suspicious GPS Duplicate)';

export interface AttendanceRecord {
  id: number;
  session_id: number;
  session_token: string;
  user_id: string;
  user_name: string;
  course: string;
  lat: number;
  lon: number;
  distance: number;
  accuracy: number;
  device_id: string;
  status: AttendanceStatus;
  flags?: string[];
  created_at: number;
}

export type OdStatus = 'Pending' | 'Approved' | 'Rejected';

export interface OdRequest {
  id: number;
  user_id: string;
  user_name: string;
  reason: string;
  date: string;
  proof_filename: string | null;
  proof_original_name: string | null;
  status: OdStatus;
  created_at: number;
  decision_notes?: string;
  reviewed_by?: string;
}

export interface SystemStats {
  attendanceRate: number;
  totalCheckins: number;
  verifiedCount: number;
  activeSessions: number;
  pendingOdRequests: number;
  todayCount: number;
  courseBreakdown: { course: string; verified: number; total: number }[];
  recentDays: { date: string; verified: number; rejected: number }[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CheckInRequest {
  token: string;
  lat: number;
  lon: number;
  accuracy: number;
  deviceId: string;
}

export interface CheckInResponse {
  success: boolean;
  status: AttendanceStatus;
  distance: number;
  message: string;
  record?: AttendanceRecord;
}

export interface AuditLogEntry {
  id: number;
  event: string;
  user_id?: string | null;
  details: string;
  timestamp: number;
}

