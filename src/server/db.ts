import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import type {
  UserRecord,
  CampusConfig,
  ClassSession,
  AttendanceRecord,
  AttendanceStatus,
  OdRequest,
  SystemStats,
  UserRole,
} from '../types/index.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'geocampus.sqlite');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'geocampus_db.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_FILE);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

export async function initDb(): Promise<void> {
  const db = getDb();

  // Create Relational Schema with strict constraints and indexes (PDF Section 5)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'faculty', 'admin')),
      department TEXT,
      email TEXT,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      campus_name TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      radius REAL NOT NULL,
      max_gps_accuracy REAL NOT NULL,
      allow_tolerance_meters REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      previous_token TEXT,
      course TEXT NOT NULL,
      faculty_id TEXT NOT NULL,
      faculty_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      auto_rotate INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (faculty_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      session_token TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      course TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      distance INTEGER NOT NULL,
      accuracy REAL NOT NULL,
      device_id TEXT NOT NULL,
      status TEXT NOT NULL,
      flags TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Unique composite index for verified status (PDF Section 5 & Bug 13)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_att_verified_unique 
      ON attendance(session_id, user_id) 
      WHERE status = 'Verified';

    CREATE INDEX IF NOT EXISTS idx_att_user_created 
      ON attendance(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_att_session_device 
      ON attendance(session_id, device_id);

    CREATE TABLE IF NOT EXISTS od_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      date TEXT NOT NULL,
      proof_filename TEXT,
      proof_original_name TEXT,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
      decision_notes TEXT,
      reviewed_by TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      user_id TEXT,
      details TEXT,
      timestamp INTEGER NOT NULL
    );
  `);

  // Check if users exist; if not, seed or migrate from legacy JSON
  const userCount = (db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    let migrated = false;

    // Check if legacy JSON file exists for migration
    if (fs.existsSync(LEGACY_JSON_FILE)) {
      try {
        const raw = fs.readFileSync(LEGACY_JSON_FILE, 'utf-8');
        const legacy = JSON.parse(raw);

        const insertUser = db.prepare(
          'INSERT OR IGNORE INTO users (id, name, role, department, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const insertConfig = db.prepare(
          'INSERT OR REPLACE INTO config (id, campus_name, lat, lon, radius, max_gps_accuracy, allow_tolerance_meters) VALUES (1, ?, ?, ?, ?, ?, ?)'
        );
        const insertAtt = db.prepare(
          'INSERT INTO attendance (id, session_id, session_token, user_id, user_name, course, lat, lon, distance, accuracy, device_id, status, flags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        const insertOd = db.prepare(
          'INSERT INTO od_requests (id, user_id, user_name, reason, date, proof_filename, proof_original_name, status, decision_notes, reviewed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        const migrateTx = db.transaction(() => {
          if (Array.isArray(legacy.users)) {
            for (const u of legacy.users) {
              insertUser.run(u.id, u.name, u.role, u.department || null, u.email || null, u.password_hash);
            }
          }

          if (legacy.config) {
            insertConfig.run(
              legacy.config.campusName || 'CIT Central Academic Quadrangle',
              legacy.config.lat || 13.0827,
              legacy.config.lon || 80.2707,
              legacy.config.radius || 50,
              legacy.config.maxGpsAccuracy || 50,
              legacy.config.allowToleranceMeters || 5
            );
          }

          if (Array.isArray(legacy.attendance)) {
            for (const a of legacy.attendance) {
              insertAtt.run(
                a.id,
                a.session_id || 0,
                a.session_token || 'SESSION-INIT',
                a.user_id,
                a.user_name || 'Student',
                a.course || 'CS301',
                a.lat || 13.0827,
                a.lon || 80.2707,
                Math.round(a.distance || 0),
                a.accuracy || 10,
                a.device_id || 'dev_legacy',
                a.status || 'Verified',
                a.flags ? JSON.stringify(a.flags) : null,
                a.created_at || Date.now()
              );
            }
          }

          if (Array.isArray(legacy.od_requests)) {
            for (const od of legacy.od_requests) {
              insertOd.run(
                od.id,
                od.user_id,
                od.user_name || 'Student',
                od.reason,
                od.date,
                od.proof_filename || null,
                od.proof_original_name || null,
                od.status || 'Pending',
                od.decision_notes || null,
                od.reviewed_by || null,
                od.created_at || Date.now()
              );
            }
          }
        });

        migrateTx();
        migrated = true;
        insertAuditLog('DATABASE_MIGRATED', 'SYSTEM', 'Migrated legacy JSON database to SQLite relational schema.');
      } catch (err) {
        console.warn('Failed to migrate legacy JSON data, proceeding with fresh seed:', err);
      }
    }

    if (!migrated) {
      // Initial Seed Data with bcrypt hashed passwords (cost factor 12)
      const studentHash = await bcrypt.hash('student123', 12);
      const facultyHash = await bcrypt.hash('faculty123', 12);
      const adminHash = await bcrypt.hash('admin123', 12);

      const insertUser = db.prepare(
        'INSERT INTO users (id, name, role, department, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)'
      );

      const seedTx = db.transaction(() => {
        insertUser.run('CIT2026001', 'Aditya Sharma', 'student', 'Computer Science & Engineering', 'aditya.cit@campus.edu', studentHash);
        insertUser.run('CIT2026002', 'Priya Narayanan', 'student', 'Computer Science & Engineering', 'priya.cit@campus.edu', studentHash);
        insertUser.run('CIT2026003', 'Kavita Menon', 'student', 'Information Technology', 'kavita.cit@campus.edu', studentHash);
        insertUser.run('faculty01', 'Dr. Ramesh Kumar', 'faculty', 'Computer Science & Engineering', 'ramesh.kumar@faculty.campus.edu', facultyHash);
        insertUser.run('admin01', 'System Administrator', 'admin', 'IT Infrastructure & Security', 'security.admin@campus.edu', adminHash);

        db.prepare(
          'INSERT OR REPLACE INTO config (id, campus_name, lat, lon, radius, max_gps_accuracy, allow_tolerance_meters) VALUES (1, ?, ?, ?, ?, ?, ?)'
        ).run('CIT Central Academic Quadrangle', 13.0827, 80.2707, 50, 50, 5);

        const now = Date.now();
        const dayMs = 86400000;

        const insertAtt = db.prepare(
          'INSERT INTO attendance (session_id, session_token, user_id, user_name, course, lat, lon, distance, accuracy, device_id, status, flags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        insertAtt.run(101, 'CS301-849201', 'CIT2026001', 'Aditya Sharma', 'CS301', 13.08271, 80.27072, 3, 6.2, 'dev_cit_demo_01', 'Verified', null, now - dayMs * 2);
        insertAtt.run(101, 'CS301-849201', 'CIT2026002', 'Priya Narayanan', 'CS301', 13.08282, 80.27065, 14, 8.5, 'dev_cit_demo_02', 'Verified', null, now - dayMs * 2 + 15000);
        insertAtt.run(102, 'CS302-194032', 'CIT2026001', 'Aditya Sharma', 'CS302', 13.08269, 80.27068, 2, 5.1, 'dev_cit_demo_01', 'Verified', null, now - dayMs);
        insertAtt.run(102, 'CS302-194032', 'CIT2026003', 'Kavita Menon', 'CS302', 13.0845, 80.2731, 320, 12.0, 'dev_cit_demo_03', 'Rejected (Out of Bounds)', null, now - dayMs + 32000);

        const insertOd = db.prepare(
          'INSERT INTO od_requests (user_id, user_name, reason, date, proof_filename, proof_original_name, status, decision_notes, reviewed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        insertOd.run('CIT2026001', 'Aditya Sharma', 'National Smart India Hackathon Grand Finale', new Date(now + dayMs * 3).toISOString().split('T')[0], null, 'sih_acceptance_letter.pdf', 'Pending', null, null, now - 3600000 * 5);
        insertOd.run('CIT2026002', 'Priya Narayanan', 'State Level Inter-College Basketball Tournament', new Date(now - dayMs * 4).toISOString().split('T')[0], null, 'sports_board_od.pdf', 'Approved', 'Approved based on Physical Education Director verification.', 'faculty01', now - dayMs * 5);
      });

      seedTx();
      insertAuditLog('SYSTEM_INIT', 'SYSTEM', 'GeoCampus SQLite relational database initialized with default configuration.');
    }
  }

  // Ensure default config exists
  const configExists = db.prepare('SELECT 1 FROM config WHERE id = 1').get();
  if (!configExists) {
    db.prepare(
      'INSERT INTO config (id, campus_name, lat, lon, radius, max_gps_accuracy, allow_tolerance_meters) VALUES (1, ?, ?, ?, ?, ?, ?)'
    ).run('CIT Central Academic Quadrangle', 13.0827, 80.2707, 50, 50, 5);
  }
}

// -------------------------------------------------------------
// User Queries
// -------------------------------------------------------------
export function findUser(id: string, role?: UserRole): UserRecord | undefined {
  const db = getDb();
  let row: any;
  if (role) {
    row = db.prepare('SELECT * FROM users WHERE LOWER(id) = LOWER(?) AND role = ?').get(id.trim(), role);
  } else {
    row = db.prepare('SELECT * FROM users WHERE LOWER(id) = LOWER(?)').get(id.trim());
  }
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    role: row.role as UserRole,
    department: row.department || undefined,
    email: row.email || undefined,
    password_hash: row.password_hash,
  };
}

export function getUserPublic(id: string) {
  const user = findUser(id);
  if (!user) return undefined;
  const { password_hash, ...rest } = user;
  return rest;
}

// -------------------------------------------------------------
// Config Queries
// -------------------------------------------------------------
export function getConfig(): CampusConfig {
  const db = getDb();
  const row = db.prepare('SELECT * FROM config WHERE id = 1').get() as any;
  if (!row) {
    return {
      id: 1,
      campusName: 'CIT Central Academic Quadrangle',
      lat: 13.0827,
      lon: 80.2707,
      radius: 50,
      maxGpsAccuracy: 50,
      allowToleranceMeters: 5,
    };
  }
  return {
    id: row.id,
    campusName: row.campus_name,
    lat: row.lat,
    lon: row.lon,
    radius: row.radius,
    maxGpsAccuracy: row.max_gps_accuracy,
    allowToleranceMeters: row.allow_tolerance_meters,
  };
}

export function updateConfig(updates: Partial<CampusConfig>): CampusConfig {
  const db = getDb();
  const current = getConfig();
  const newConfig = { ...current, ...updates };

  db.prepare(`
    UPDATE config SET
      campus_name = ?,
      lat = ?,
      lon = ?,
      radius = ?,
      max_gps_accuracy = ?,
      allow_tolerance_meters = ?
    WHERE id = 1
  `).run(
    newConfig.campusName,
    newConfig.lat,
    newConfig.lon,
    newConfig.radius,
    newConfig.maxGpsAccuracy,
    newConfig.allowToleranceMeters
  );

  return newConfig;
}

// -------------------------------------------------------------
// Session Queries
// -------------------------------------------------------------
export function createSession(
  course: string,
  facultyId: string,
  facultyName: string,
  token: string,
  durationSec: number = 60,
  autoRotate: boolean = true
): ClassSession {
  const db = getDb();
  const now = Date.now();
  const expiresAt = now + durationSec * 1000;
  const upperToken = token.toUpperCase();
  const upperCourse = course.toUpperCase();

  const info = db.prepare(`
    INSERT INTO sessions (token, previous_token, course, faculty_id, faculty_name, created_at, expires_at, is_active, auto_rotate)
    VALUES (?, NULL, ?, ?, ?, ?, ?, 1, ?)
  `).run(upperToken, upperCourse, facultyId, facultyName, now, expiresAt, autoRotate ? 1 : 0);

  return {
    id: Number(info.lastInsertRowid),
    token: upperToken,
    course: upperCourse,
    faculty_id: facultyId,
    faculty_name: facultyName,
    created_at: now,
    expires_at: expiresAt,
    is_active: true,
    auto_rotate: autoRotate,
  };
}

export function rotateSessionToken(sessionId: number, newToken: string, durationSec: number = 45): ClassSession | null {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return null;

  const now = Date.now();
  const expiresAt = now + durationSec * 1000;
  const upperToken = newToken.toUpperCase();

  db.prepare(`
    UPDATE sessions SET
      previous_token = token,
      token = ?,
      created_at = ?,
      expires_at = ?,
      is_active = 1
    WHERE id = ?
  `).run(upperToken, now, expiresAt, sessionId);

  return {
    id: sessionId,
    token: upperToken,
    previous_token: session.token,
    course: session.course,
    faculty_id: session.faculty_id,
    faculty_name: session.faculty_name,
    created_at: now,
    expires_at: expiresAt,
    is_active: true,
    auto_rotate: Boolean(session.auto_rotate),
  };
}

export function getSessionByToken(token: string): ClassSession | undefined {
  const db = getDb();
  const upper = token.trim().toUpperCase();
  const now = Date.now();

  // Valid if matches active token and not expired, OR matches previous token within 45s grace window
  const row = db.prepare(`
    SELECT * FROM sessions
    WHERE (token = ? AND expires_at > ?)
       OR (previous_token = ? AND (? - expires_at) < 45000)
    ORDER BY created_at DESC LIMIT 1
  `).get(upper, now, upper, now) as any;

  if (!row) return undefined;
  return {
    id: row.id,
    token: row.token,
    previous_token: row.previous_token || undefined,
    course: row.course,
    faculty_id: row.faculty_id,
    faculty_name: row.faculty_name,
    created_at: row.created_at,
    expires_at: row.expires_at,
    is_active: Boolean(row.is_active),
    auto_rotate: Boolean(row.auto_rotate),
  };
}

export function getActiveSessions(): ClassSession[] {
  const db = getDb();
  const now = Date.now();
  const rows = db.prepare('SELECT * FROM sessions WHERE is_active = 1 AND expires_at > ? ORDER BY created_at DESC').all(now) as any[];
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    previous_token: r.previous_token || undefined,
    course: r.course,
    faculty_id: r.faculty_id,
    faculty_name: r.faculty_name,
    created_at: r.created_at,
    expires_at: r.expires_at,
    is_active: Boolean(r.is_active),
    auto_rotate: Boolean(r.auto_rotate),
  }));
}

export function getFacultyActiveSession(facultyId: string): ClassSession | undefined {
  const db = getDb();
  const now = Date.now();
  const row = db.prepare(`
    SELECT * FROM sessions
    WHERE faculty_id = ? AND is_active = 1 AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(facultyId, now) as any;

  if (!row) return undefined;
  return {
    id: row.id,
    token: row.token,
    previous_token: row.previous_token || undefined,
    course: row.course,
    faculty_id: row.faculty_id,
    faculty_name: row.faculty_name,
    created_at: row.created_at,
    expires_at: row.expires_at,
    is_active: Boolean(row.is_active),
    auto_rotate: Boolean(row.auto_rotate),
  };
}

// -------------------------------------------------------------
// Attendance Queries
// -------------------------------------------------------------
export function getAttendanceLogs(role: UserRole, userId: string): AttendanceRecord[] {
  const db = getDb();
  let rows: any[];

  if (role === 'student') {
    rows = db.prepare(`
      SELECT * FROM attendance
      WHERE LOWER(user_id) = LOWER(?)
      ORDER BY created_at DESC
    `).all(userId);
  } else if (role === 'faculty') {
    rows = db.prepare(`
      SELECT a.* FROM attendance a
      JOIN sessions s ON s.id = a.session_id
      WHERE s.faculty_id = ? OR a.course LIKE 'CS%'
      ORDER BY a.created_at DESC
    `).all(userId);
  } else {
    // Admin sees all
    rows = db.prepare(`
      SELECT * FROM attendance
      ORDER BY created_at DESC
    `).all();
  }

  return rows.map(mapAttendanceRow);
}

export function hasVerifiedAttendance(sessionId: number, userId: string): boolean {
  const db = getDb();
  const row = db.prepare(`
    SELECT 1 FROM attendance
    WHERE session_id = ? AND LOWER(user_id) = LOWER(?) AND status = 'Verified'
    LIMIT 1
  `).get(sessionId, userId);
  return Boolean(row);
}

export function getRecentUserCheckins(userId: string, limit: number = 3): AttendanceRecord[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM attendance
    WHERE LOWER(user_id) = LOWER(?)
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit) as any[];

  return rows.map(mapAttendanceRow);
}

export function getDeviceAttendanceInSession(sessionId: number, deviceId: string): AttendanceRecord[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM attendance
    WHERE session_id = ? AND device_id = ?
  `).all(sessionId, deviceId) as any[];

  return rows.map(mapAttendanceRow);
}

export function getCoordinatesAttendanceInSession(
  sessionId: number,
  lat: number,
  lon: number,
  toleranceDeg: number = 0.000005
): AttendanceRecord[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM attendance
    WHERE session_id = ?
      AND ABS(lat - ?) < ?
      AND ABS(lon - ?) < ?
  `).all(sessionId, lat, toleranceDeg, lon, toleranceDeg) as any[];

  return rows.map(mapAttendanceRow);
}

export function insertAttendance(record: Omit<AttendanceRecord, 'id'>): AttendanceRecord {
  const db = getDb();
  const flagsJson = record.flags && record.flags.length > 0 ? JSON.stringify(record.flags) : null;

  const info = db.prepare(`
    INSERT INTO attendance (
      session_id, session_token, user_id, user_name, course,
      lat, lon, distance, accuracy, device_id, status, flags, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.session_id,
    record.session_token,
    record.user_id,
    record.user_name,
    record.course,
    record.lat,
    record.lon,
    Math.round(record.distance),
    record.accuracy,
    record.device_id,
    record.status,
    flagsJson,
    record.created_at || Date.now()
  );

  return {
    ...record,
    id: Number(info.lastInsertRowid),
  };
}

function mapAttendanceRow(row: any): AttendanceRecord {
  let flags: string[] | undefined = undefined;
  if (row.flags) {
    try {
      flags = JSON.parse(row.flags);
    } catch {}
  }
  return {
    id: row.id,
    session_id: row.session_id,
    session_token: row.session_token,
    user_id: row.user_id,
    user_name: row.user_name,
    course: row.course,
    lat: row.lat,
    lon: row.lon,
    distance: row.distance,
    accuracy: row.accuracy,
    device_id: row.device_id,
    status: row.status as AttendanceStatus,
    flags,
    created_at: row.created_at,
  };
}

// -------------------------------------------------------------
// OD Queries
// -------------------------------------------------------------
export function getOdRequests(role: UserRole, userId: string): OdRequest[] {
  const db = getDb();
  let rows: any[];

  if (role === 'student') {
    rows = db.prepare(`
      SELECT * FROM od_requests
      WHERE LOWER(user_id) = LOWER(?)
      ORDER BY created_at DESC
    `).all(userId);
  } else {
    // Faculty & Admin see all
    rows = db.prepare(`
      SELECT * FROM od_requests
      ORDER BY created_at DESC
    `).all();
  }

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    user_name: r.user_name,
    reason: r.reason,
    date: r.date,
    proof_filename: r.proof_filename,
    proof_original_name: r.proof_original_name,
    status: r.status,
    decision_notes: r.decision_notes || undefined,
    reviewed_by: r.reviewed_by || undefined,
    created_at: r.created_at,
  }));
}

export function createOdRequest(
  userId: string,
  userName: string,
  reason: string,
  date: string,
  proofFilename: string | null,
  proofOriginalName: string | null
): OdRequest {
  const db = getDb();
  const now = Date.now();

  const info = db.prepare(`
    INSERT INTO od_requests (user_id, user_name, reason, date, proof_filename, proof_original_name, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
  `).run(userId, userName, reason, date, proofFilename, proofOriginalName, now);

  return {
    id: Number(info.lastInsertRowid),
    user_id: userId,
    user_name: userName,
    reason,
    date,
    proof_filename: proofFilename,
    proof_original_name: proofOriginalName,
    status: 'Pending',
    created_at: now,
  };
}

export function updateOdDecision(
  id: number,
  decision: 'Approved' | 'Rejected',
  reviewerId: string,
  notes?: string
): OdRequest | null {
  const db = getDb();
  const od = db.prepare('SELECT * FROM od_requests WHERE id = ?').get(id) as any;
  if (!od) return null;

  db.prepare(`
    UPDATE od_requests SET
      status = ?,
      reviewed_by = ?,
      decision_notes = ?
    WHERE id = ?
  `).run(decision, reviewerId, notes || null, id);

  return {
    id: od.id,
    user_id: od.user_id,
    user_name: od.user_name,
    reason: od.reason,
    date: od.date,
    proof_filename: od.proof_filename,
    proof_original_name: od.proof_original_name,
    status: decision,
    decision_notes: notes || undefined,
    reviewed_by: reviewerId,
    created_at: od.created_at,
  };
}

// -------------------------------------------------------------
// System Statistics Queries (Live Relational Aggregations)
// -------------------------------------------------------------
export function getSystemStats(role: UserRole, userId: string): SystemStats {
  const db = getDb();
  const now = Date.now();

  const activeSessions = (
    db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE is_active = 1 AND expires_at > ?').get(now) as { c: number }
  ).c;

  const pendingOdRequests = (
    db.prepare("SELECT COUNT(*) AS c FROM od_requests WHERE status = 'Pending'").get() as { c: number }
  ).c;

  let totalCheckins = 0;
  let verifiedCount = 0;
  let todayCount = 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayTs = startOfDay.getTime();

  if (role === 'student') {
    totalCheckins = (
      db.prepare('SELECT COUNT(*) AS c FROM attendance WHERE LOWER(user_id) = LOWER(?)').get(userId) as { c: number }
    ).c;
    verifiedCount = (
      db.prepare("SELECT COUNT(*) AS c FROM attendance WHERE LOWER(user_id) = LOWER(?) AND status = 'Verified'").get(userId) as { c: number }
    ).c;
    todayCount = (
      db.prepare('SELECT COUNT(*) AS c FROM attendance WHERE LOWER(user_id) = LOWER(?) AND created_at >= ?').get(userId, startOfDayTs) as { c: number }
    ).c;
  } else {
    totalCheckins = (db.prepare('SELECT COUNT(*) AS c FROM attendance').get() as { c: number }).c;
    verifiedCount = (db.prepare("SELECT COUNT(*) AS c FROM attendance WHERE status = 'Verified'").get() as { c: number }).c;
    todayCount = (db.prepare('SELECT COUNT(*) AS c FROM attendance WHERE created_at >= ?').get(startOfDayTs) as { c: number }).c;
  }

  const attendanceRate = totalCheckins > 0 ? Number(((verifiedCount / totalCheckins) * 100).toFixed(1)) : 100;

  // Course breakdown
  let courseRows: any[];
  if (role === 'student') {
    courseRows = db.prepare(`
      SELECT course,
             COUNT(*) AS total,
             SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END) AS verified
      FROM attendance
      WHERE LOWER(user_id) = LOWER(?)
      GROUP BY course
    `).all(userId);
  } else {
    courseRows = db.prepare(`
      SELECT course,
             COUNT(*) AS total,
             SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END) AS verified
      FROM attendance
      GROUP BY course
    `).all();
  }

  const courseBreakdown = courseRows.map((r) => ({
    course: r.course,
    total: r.total,
    verified: r.verified || 0,
  }));

  // Recent 7 days activity
  const recentDays: { date: string; verified: number; rejected: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayStart = new Date(d).setHours(0, 0, 0, 0);
    const dayEnd = new Date(d).setHours(23, 59, 59, 999);

    let dayVerified = 0;
    let dayRejected = 0;

    if (role === 'student') {
      dayVerified = (
        db.prepare(
          "SELECT COUNT(*) AS c FROM attendance WHERE LOWER(user_id) = LOWER(?) AND status = 'Verified' AND created_at >= ? AND created_at <= ?"
        ).get(userId, dayStart, dayEnd) as { c: number }
      ).c;
      dayRejected = (
        db.prepare(
          "SELECT COUNT(*) AS c FROM attendance WHERE LOWER(user_id) = LOWER(?) AND status != 'Verified' AND created_at >= ? AND created_at <= ?"
        ).get(userId, dayStart, dayEnd) as { c: number }
      ).c;
    } else {
      dayVerified = (
        db.prepare(
          "SELECT COUNT(*) AS c FROM attendance WHERE status = 'Verified' AND created_at >= ? AND created_at <= ?"
        ).get(dayStart, dayEnd) as { c: number }
      ).c;
      dayRejected = (
        db.prepare(
          "SELECT COUNT(*) AS c FROM attendance WHERE status != 'Verified' AND created_at >= ? AND created_at <= ?"
        ).get(dayStart, dayEnd) as { c: number }
      ).c;
    }

    recentDays.push({ date: dateStr, verified: dayVerified, rejected: dayRejected });
  }

  return {
    attendanceRate,
    totalCheckins,
    verifiedCount,
    activeSessions,
    pendingOdRequests,
    todayCount,
    courseBreakdown,
    recentDays,
  };
}

// -------------------------------------------------------------
// Import / Export
// -------------------------------------------------------------
export function importAttendanceRecords(records: any[]): {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
} {
  const db = getDb();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const insertStmt = db.prepare(`
    INSERT INTO attendance (
      session_id, session_token, user_id, user_name, course,
      lat, lon, distance, accuracy, device_id, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const checkDuplicate = db.prepare(`
    SELECT 1 FROM attendance
    WHERE session_token = ? AND LOWER(user_id) = LOWER(?) AND status = ?
    LIMIT 1
  `);

  const importTx = db.transaction((rows: any[]) => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 1;

      const userId = String(r.userId || r['User ID'] || r.user || '').trim();
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(userId)) {
        errors.push(`Row ${rowNum}: Invalid User ID format ("${userId}").`);
        continue;
      }

      const course = String(r.course || r.Course || r.Subject || 'CS301').trim().toUpperCase();
      const sessionToken = String(r.session_token || r.sessionId || r['Session ID'] || `${course}-IMPORT`).trim().toUpperCase();
      const rawStatus = String(r.status || r.Status || 'Verified').trim();
      const status: AttendanceStatus = rawStatus.includes('Verified') ? 'Verified' : 'Rejected (Out of Bounds)';
      const lat = Number(r.lat || r.latitude || (r.coords ? String(r.coords).split(',')[0] : 13.0827));
      const lon = Number(r.lon || r.longitude || (r.coords ? String(r.coords).split(',')[1] : 80.2707));

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        errors.push(`Row ${rowNum}: Coordinates must be valid numbers.`);
        continue;
      }

      // Check duplicate
      const exists = checkDuplicate.get(sessionToken, userId, status);
      if (exists) {
        skipped++;
        continue;
      }

      const userRow = db.prepare('SELECT name FROM users WHERE LOWER(id) = LOWER(?)').get(userId) as any;
      const userName = userRow ? userRow.name : `Student (${userId})`;

      try {
        insertStmt.run(
          0,
          sessionToken,
          userId,
          userName,
          course,
          lat,
          lon,
          Math.round(Number(r.distance ? String(r.distance).replace('m', '') : 10)),
          Number(r.accuracy || 10),
          String(r.device_id || 'imported_batch'),
          status,
          r.created_at || (r.timestamp ? new Date(r.timestamp).getTime() : Date.now())
        );
        imported++;
      } catch (err: any) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          skipped++;
        } else {
          errors.push(`Row ${rowNum}: ${err.message}`);
        }
      }
    }
  });

  importTx(records);
  return { total: records.length, imported, skipped, errors };
}

// -------------------------------------------------------------
// Audit Logs
// -------------------------------------------------------------
export function insertAuditLog(event: string, userId?: string, details: string = ''): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_logs (event, user_id, details, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(event, userId || null, details, Date.now());
}

export function getAuditLogs(limit: number = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
}
