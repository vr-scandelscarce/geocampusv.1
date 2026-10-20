import { getConfig, getRecentUserCheckins, getDeviceAttendanceInSession, getCoordinatesAttendanceInSession } from './db.js';
import type { AttendanceStatus } from '../types/index.js';

/**
 * High-precision Haversine formula to compute great-circle distance between two GPS coordinates in meters.
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's mean radius in meters
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export interface GeofenceEvaluation {
  distance: number;
  allowedRadius: number;
  isInside: boolean;
  accuracy: number;
  status: AttendanceStatus;
  flags: string[];
  rejectionReason?: string;
}

/**
 * Validates GPS coordinates against campus geofence and executes multi-vector anti-spoofing heuristics.
 */
export function evaluateGeofenceAndSpoofing(
  userLat: number,
  userLon: number,
  accuracy: number,
  userId: string,
  sessionId: number,
  deviceId: string
): GeofenceEvaluation {
  const config = getConfig();
  const distance = haversineDistance(userLat, userLon, config.lat, config.lon);
  const flags: string[] = [];

  // 1. Strict Geofence Radius Check (Bug 5: Do NOT add accuracy to radius)
  const allowedRadius = config.radius + Math.min(config.allowToleranceMeters, 10);
  const isInside = distance <= allowedRadius;

  // 2. Anti-Spoofing: Accuracy anomalies
  if (accuracy <= 0 || (accuracy < 1.0 && Number.isInteger(accuracy))) {
    flags.push('SUSPICIOUS_ACCURACY_ZERO');
  }

  if (accuracy > config.maxGpsAccuracy) {
    return {
      distance,
      allowedRadius,
      isInside: false,
      accuracy,
      status: 'Rejected (Weak GPS)',
      flags,
      rejectionReason: `GPS accuracy is too low (±${Math.round(accuracy)}m). Maximum allowed is ±${config.maxGpsAccuracy}m. Please step outdoors or disable power saving mode.`,
    };
  }

  // 3. Anti-Spoofing: Device sharing flag (Bug 16)
  if (deviceId) {
    const existingDeviceLogs = getDeviceAttendanceInSession(sessionId, deviceId);
    const otherUsersOnDevice = existingDeviceLogs.filter(
      (log) => log.user_id.toLowerCase() !== userId.toLowerCase()
    );

    if (otherUsersOnDevice.length > 0) {
      flags.push('DEVICE_SHARING_DETECTED');
      return {
        distance,
        allowedRadius,
        isInside,
        accuracy,
        status: 'Flagged (Shared Device)',
        flags,
        rejectionReason: `Device sharing detected: This hardware device was already used by ${otherUsersOnDevice[0].user_name} (${otherUsersOnDevice[0].user_id}) for this class session.`,
      };
    }
  }

  // 4. Anti-Spoofing: Suspicious Coordinate Duplication (Bug 16)
  // If another student in this same session used the exact same coordinates down to 6 decimal places (~10cm)
  const existingCoordLogs = getCoordinatesAttendanceInSession(sessionId, userLat, userLon);
  const otherUsersOnCoords = existingCoordLogs.filter(
    (log) => log.user_id.toLowerCase() !== userId.toLowerCase() && log.status === 'Verified'
  );
  if (otherUsersOnCoords.length > 0) {
    flags.push('SUSPICIOUS_GPS_DUPLICATE');
    return {
      distance,
      allowedRadius,
      isInside: false,
      accuracy,
      status: 'Flagged (Suspicious GPS Duplicate)',
      flags,
      rejectionReason: `Suspicious coordinate match: Identical GPS coordinates were already submitted by ${otherUsersOnCoords[0].user_name} (${otherUsersOnCoords[0].user_id}). Proxy location copying is strictly prohibited.`,
    };
  }

  // 4. Anti-Spoofing: Impossible Travel Speed Heuristic (Bug 16)
  const recentLogs = getRecentUserCheckins(userId, 1);
  if (recentLogs.length > 0) {
    const prev = recentLogs[0];
    const timeDeltaMs = Date.now() - prev.created_at;
    const timeDeltaSec = timeDeltaMs / 1000;

    // Check if recorded within last 30 minutes
    if (timeDeltaSec > 0 && timeDeltaSec < 1800) {
      const distFromPrev = haversineDistance(userLat, userLon, prev.lat, prev.lon);
      const speedKmPerHour = (distFromPrev / timeDeltaSec) * 3.6;

      // Realistic max campus speed: 120 km/h (traveling by road/metro)
      if (distFromPrev > 2000 && speedKmPerHour > 160) {
        flags.push('IMPOSSIBLE_TRAVEL_SPEED');
        return {
          distance,
          allowedRadius,
          isInside: false,
          accuracy,
          status: 'Flagged (Impossible Travel)',
          flags,
          rejectionReason: `Impossible travel velocity detected: Relocated ${Math.round(distFromPrev / 1000)}km in ${Math.round(timeDeltaSec / 60)} minutes (${Math.round(speedKmPerHour)} km/h).`,
        };
      }
    }
  }

  // 5. Final Geofence boundary determination
  if (!isInside) {
    return {
      distance,
      allowedRadius,
      isInside: false,
      accuracy,
      status: 'Rejected (Out of Bounds)',
      flags,
      rejectionReason: `Location is ${distance}m from campus center, which exceeds the authorized perimeter of ${allowedRadius}m.`,
    };
  }

  return {
    distance,
    allowedRadius,
    isInside: true,
    accuracy,
    status: 'Verified',
    flags,
  };
}
