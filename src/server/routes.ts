import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth, requireRole, generateToken } from './auth.js';
import {
  findUser,
  getUserPublic,
  getConfig,
  updateConfig,
  createSession,
  rotateSessionToken,
  getSessionByToken,
  getActiveSessions,
  getFacultyActiveSession,
  getAttendanceLogs,
  hasVerifiedAttendance,
  insertAttendance,
  getOdRequests,
  createOdRequest,
  updateOdDecision,
  getSystemStats,
  importAttendanceRecords,
  insertAuditLog,
  getAuditLogs,
} from './db.js';
import { evaluateGeofenceAndSpoofing } from './geo.js';

export const apiRouter = express.Router();

// Setup Multer for secure OD proof upload (Bug 12)
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only JPEG, PNG, WEBP, and PDF documents are allowed.'));
    }
  },
});

// -------------------------------------------------------------
// Authentication Routes (Bug 1, Bug 2)
// -------------------------------------------------------------
apiRouter.post('/login', async (req, res) => {
  try {
    const { id, password, role } = req.body;
    if (!id || !password || !role) {
      res.status(400).json({ error: 'User ID, password, and portal role are required.' });
      return;
    }

    const user = findUser(String(id).trim(), role);
    if (!user) {
      insertAuditLog('FAILED_LOGIN_UNKNOWN_USER', id, `Attempted login for role: ${role}`);
      res.status(401).json({ error: 'Invalid credentials or portal role mismatch.' });
      return;
    }

    const isMatch = await bcrypt.compare(String(password), user.password_hash);
    if (!isMatch) {
      insertAuditLog('FAILED_LOGIN_BAD_PASSWORD', id, `Bad password attempt for user: ${id}`);
      res.status(401).json({ error: 'Invalid credentials or portal role mismatch.' });
      return;
    }

    const publicUser = getUserPublic(user.id)!;
    const token = generateToken(publicUser);

    insertAuditLog('SUCCESS_LOGIN', user.id, `User logged in to ${user.role} portal.`);

    res.json({
      token,
      user: publicUser,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server login failure' });
  }
});

apiRouter.get('/auth/me', requireAuth, (req, res) => {
  const user = getUserPublic(req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User record not found.' });
    return;
  }
  res.json({ user });
});

// -------------------------------------------------------------
// Campus Configuration Routes
// -------------------------------------------------------------
apiRouter.get('/config', (_req, res) => {
  res.json(getConfig());
});

apiRouter.put('/config', requireAuth, requireRole('admin'), (req, res) => {
  const { lat, lon, radius, maxGpsAccuracy, allowToleranceMeters, campusName } = req.body;

  const numLat = Number(lat);
  const numLon = Number(lon);
  const numRadius = Number(radius);

  if (!Number.isFinite(numLat) || !Number.isFinite(numLon) || !Number.isFinite(numRadius) || numRadius <= 0) {
    res.status(400).json({ error: 'Invalid parameters. Latitude, longitude, and positive radius required.' });
    return;
  }

  const updated = updateConfig({
    lat: numLat,
    lon: numLon,
    radius: numRadius,
    maxGpsAccuracy: Number(maxGpsAccuracy) || 50,
    allowToleranceMeters: Math.min(Number(allowToleranceMeters) || 0, 10), // Max 10m tolerance (Bug 5)
    campusName: campusName ? String(campusName).trim() : undefined,
  });

  insertAuditLog('CONFIG_UPDATED', req.user!.id, `Updated geofence to (${numLat}, ${numLon}), radius ${numRadius}m`);

  res.json({ success: true, config: updated });
});

// -------------------------------------------------------------
// Class Session Routes (Bug 4, Bug 9)
// -------------------------------------------------------------
apiRouter.post('/sessions', requireAuth, requireRole('faculty'), (req, res) => {
  const course = String(req.body.course || 'CS301').toUpperCase().trim().slice(0, 12);
  if (!/^[A-Z0-9-]{2,12}$/.test(course)) {
    res.status(400).json({ error: 'Invalid course code format (2-12 alphanumeric characters).' });
    return;
  }

  // Cryptographically secure 6-digit random token (Bug 4)
  const code = crypto.randomInt(100000, 999999);
  const token = `${course}-${code}`;
  const durationSec = Number(req.body.durationSec) || 45;
  const autoRotate = Boolean(req.body.autoRotate ?? true);

  const session = createSession(course, req.user!.id, req.user!.name, token, durationSec, autoRotate);

  insertAuditLog('SESSION_CREATED', req.user!.id, `Created session ${token} for ${course}`);

  res.json({
    id: session.id,
    token: session.token,
    course: session.course,
    faculty_name: session.faculty_name,
    expiresAt: session.expires_at,
    durationSec,
  });
});

apiRouter.post('/sessions/rotate', requireAuth, requireRole('faculty'), (req, res) => {
  const { sessionId, course } = req.body;
  const sid = Number(sessionId);
  if (!sid) {
    res.status(400).json({ error: 'Valid sessionId required' });
    return;
  }

  const courseCode = String(course || 'CS301').toUpperCase().slice(0, 12);
  const code = crypto.randomInt(100000, 999999);
  const newToken = `${courseCode}-${code}`;

  const updated = rotateSessionToken(sid, newToken, 45);
  if (!updated) {
    res.status(404).json({ error: 'Session not found to rotate' });
    return;
  }

  res.json({
    id: updated.id,
    token: updated.token,
    previousToken: updated.previous_token,
    expiresAt: updated.expires_at,
  });
});

apiRouter.get('/sessions/active', requireAuth, (_req, res) => {
  res.json(getActiveSessions());
});

apiRouter.get('/sessions/faculty-active', requireAuth, requireRole('faculty'), (req, res) => {
  const session = getFacultyActiveSession(req.user!.id);
  res.json({ session: session || null });
});

// -------------------------------------------------------------
// Student Attendance Check-In (Bug 3, Bug 5, Bug 6, Bug 16)
// -------------------------------------------------------------
apiRouter.post('/checkin', requireAuth, requireRole('student'), (req, res) => {
  const { token, lat, lon, accuracy, deviceId } = req.body;

  const numLat = Number(lat);
  const numLon = Number(lon);
  const numAccuracy = Number(accuracy);

  if (!token || !Number.isFinite(numLat) || !Number.isFinite(numLon) || !Number.isFinite(numAccuracy)) {
    res.status(400).json({
      success: false,
      error: 'Invalid check-in parameters. Token, GPS coordinates, and accuracy are required.',
    });
    return;
  }

  // 1. Verify Session Token Validity & Expiry on Server (Bug 3, Bug 4)
  const session = getSessionByToken(String(token));
  if (!session) {
    res.status(400).json({
      success: false,
      status: 'Rejected (Invalid Token)',
      error: 'Session token is invalid or has expired. Please verify the code on your instructor screen.',
    });
    return;
  }

  // 2. Prevent Multiple "Verified" check-ins, but allow retry if previously Rejected (Bug 6)
  const alreadyVerified = hasVerifiedAttendance(session.id, req.user!.id);
  if (alreadyVerified) {
    res.status(409).json({
      success: false,
      status: 'Already Verified',
      error: `Attendance is already successfully recorded and verified for session ${session.token}.`,
    });
    return;
  }

  // 3. Server-side Geofence & Anti-Spoofing Heuristics (Bug 3, Bug 5, Bug 16)
  const evalResult = evaluateGeofenceAndSpoofing(
    numLat,
    numLon,
    numAccuracy,
    req.user!.id,
    session.id,
    String(deviceId || '')
  );

  // 4. Server writes the attendance log into the persistent database (Bug 3)
  const record = insertAttendance({
    session_id: session.id,
    session_token: session.token,
    user_id: req.user!.id,
    user_name: req.user!.name,
    course: session.course,
    lat: numLat,
    lon: numLon,
    distance: evalResult.distance,
    accuracy: Math.round(numAccuracy * 10) / 10,
    device_id: String(deviceId || 'unknown_device'),
    status: evalResult.status,
    flags: evalResult.flags,
    created_at: Date.now(),
  });

  if (evalResult.isInside && evalResult.status === 'Verified') {
    insertAuditLog('ATTENDANCE_VERIFIED', req.user!.id, `Verified check-in for session ${session.token} at ${evalResult.distance}m`);
    res.json({
      success: true,
      status: evalResult.status,
      distance: evalResult.distance,
      message: `Attendance verified! You are ${evalResult.distance}m from campus center within the authorized perimeter.`,
      record,
    });
  } else {
    insertAuditLog('ATTENDANCE_REJECTED', req.user!.id, `Rejected (${evalResult.status}) for session ${session.token}: ${evalResult.rejectionReason}`);
    res.status(400).json({
      success: false,
      status: evalResult.status,
      distance: evalResult.distance,
      error: evalResult.rejectionReason || 'Check-in validation failed.',
      record,
    });
  }
});

// -------------------------------------------------------------
// Attendance Logs & Statistics (Bug 10, Bug 11)
// -------------------------------------------------------------
apiRouter.get('/attendance', requireAuth, (req, res) => {
  const logs = getAttendanceLogs(req.user!.role, req.user!.id);
  res.json(logs);
});

apiRouter.get('/stats', requireAuth, (req, res) => {
  const stats = getSystemStats(req.user!.role, req.user!.id);
  res.json(stats);
});

// -------------------------------------------------------------
// On-Duty (OD) Requests (Bug 12)
// -------------------------------------------------------------
apiRouter.post('/od', requireAuth, requireRole('student'), upload.single('proof'), (req, res) => {
  try {
    const { reason, date } = req.body;
    if (!reason || !date) {
      res.status(400).json({ error: 'Reason and event date are required.' });
      return;
    }

    const file = req.file;
    const proofFilename = file ? file.filename : null;
    const proofOriginalName = file ? file.originalname : null;

    const od = createOdRequest(
      req.user!.id,
      req.user!.name,
      String(reason).trim(),
      String(date).trim(),
      proofFilename,
      proofOriginalName
    );

    insertAuditLog('OD_REQUEST_SUBMITTED', req.user!.id, `Submitted OD for ${reason} on ${date}`);

    res.json({ success: true, request: od });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to submit OD request' });
  }
});

apiRouter.get('/od/mine', requireAuth, requireRole('student'), (req, res) => {
  const myRequests = getOdRequests('student', req.user!.id);
  res.json(myRequests);
});

apiRouter.get('/od', requireAuth, requireRole('faculty', 'admin'), (req, res) => {
  const allRequests = getOdRequests(req.user!.role, req.user!.id);
  res.json(allRequests);
});

apiRouter.post('/od/:id/decision', requireAuth, requireRole('faculty', 'admin'), (req, res) => {
  const id = Number(req.params.id);
  const { decision, notes } = req.body;

  if (!id || !['Approved', 'Rejected'].includes(decision)) {
    res.status(400).json({ error: 'Valid request ID and decision ("Approved" or "Rejected") required.' });
    return;
  }

  const updated = updateOdDecision(id, decision, req.user!.id, notes ? String(notes).trim() : undefined);
  if (!updated) {
    res.status(404).json({ error: 'OD request not found.' });
    return;
  }

  insertAuditLog('OD_DECISION_UPDATED', req.user!.id, `${decision} OD #${id} for student ${updated.user_id}`);

  res.json({ success: true, request: updated });
});

apiRouter.get('/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Requested proof document not found.' });
    return;
  }

  res.sendFile(filePath);
});

// -------------------------------------------------------------
// Admin Import / Export & Administration (Bug 13)
// -------------------------------------------------------------
apiRouter.post('/import', requireAuth, requireRole('admin'), (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    res.status(400).json({ error: 'Invalid payload: Array of records required.' });
    return;
  }

  const result = importAttendanceRecords(records);
  insertAuditLog('IMPORT_PERFORMED', req.user!.id, `Imported ${result.imported} records (${result.skipped} skipped)`);

  res.json(result);
});

apiRouter.get('/export', requireAuth, requireRole('admin'), (_req, res) => {
  const logs = getAttendanceLogs('admin', '');
  res.json(logs);
});

apiRouter.get('/audit-logs', requireAuth, requireRole('admin'), (_req, res) => {
  const logs = getAuditLogs(100);
  res.json(logs);
});
