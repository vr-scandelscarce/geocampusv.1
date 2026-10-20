import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, UserRole, CampusConfig } from '../types/index.js';
import { api, getStoredToken, getOrCreateDeviceId } from '../lib/api.js';
import { useToast } from './ToastContext.js';

interface GpsPosition {
  lat: number;
  lon: number;
  accuracy: number;
  altitude?: number | null;
  timestamp: number;
}

interface AuthContextType {
  currentUser: User | null;
  role: UserRole | null;
  isLoading: boolean;
  deviceId: string;
  campusConfig: CampusConfig | null;
  userGps: GpsPosition | null;
  isSimulatingGps: boolean;
  gpsDistance: number | null;
  isInsideGeofence: boolean | null;
  gpsStatusMessage: string;
  login: (id: string, pass: string, role: UserRole) => Promise<boolean>;
  logout: () => void;
  refreshConfig: () => Promise<void>;
  setSimulatedGps: (pos: GpsPosition | null) => void;
  startRealGps: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Haversine on client for UI feedback only (Server does authoritative verification)
function clientHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [campusConfig, setCampusConfig] = useState<CampusConfig | null>(null);
  const [userGps, setUserGps] = useState<GpsPosition | null>(null);
  const [isSimulatingGps, setIsSimulatingGps] = useState<boolean>(false);
  const [watchId, setWatchId] = useState<number | null>(null);

  const { showToast } = useToast();
  const deviceId = getOrCreateDeviceId();

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await api.getConfig();
      setCampusConfig(cfg);
    } catch (err: any) {
      console.warn('Could not fetch campus config:', err);
    }
  }, []);

  // Check existing session
  useEffect(() => {
    const initSession = async () => {
      const token = getStoredToken();
      await refreshConfig();

      if (token) {
        try {
          const res = await api.getCurrentUser();
          setCurrentUser(res.user);
        } catch {
          api.logout();
          setCurrentUser(null);
        }
      }
      setIsLoading(false);
    };

    initSession();
  }, [refreshConfig]);

  // GPS Watcher
  const startRealGps = useCallback(() => {
    setIsSimulatingGps(false);
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserGps({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        console.warn('GPS location error:', err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    setWatchId(id);
  }, [watchId, showToast]);

  useEffect(() => {
    if (currentUser) {
      // Default to campus location simulation on start if device GPS has not loaded yet, or real GPS
      startRealGps();
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [currentUser]);

  const setSimulatedGps = (pos: GpsPosition | null) => {
    if (pos) {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
      }
      setIsSimulatingGps(true);
      setUserGps(pos);
      showToast(`GPS position set to ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)} (±${pos.accuracy}m)`, 'info');
    } else {
      startRealGps();
    }
  };

  const login = async (id: string, pass: string, role: UserRole): Promise<boolean> => {
    try {
      const res = await api.login(id, pass, role);
      setCurrentUser(res.user);
      showToast(`Welcome back, ${res.user.name}! Signed in to ${res.user.role.toUpperCase()} portal.`, 'success');
      return true;
    } catch (err: any) {
      showToast(err.message || 'Login failed. Please check your credentials.', 'error');
      return false;
    }
  };

  const logout = () => {
    api.logout();
    setCurrentUser(null);
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    showToast('You have been signed out safely.', 'info');
  };

  // Compute distance for UI display
  let gpsDistance: number | null = null;
  let isInsideGeofence: boolean | null = null;
  let gpsStatusMessage = 'Acquiring GPS fix...';

  if (campusConfig && userGps) {
    gpsDistance = clientHaversine(userGps.lat, userGps.lon, campusConfig.lat, campusConfig.lon);
    const maxRadius = campusConfig.radius + Math.min(campusConfig.allowToleranceMeters, 10);
    isInsideGeofence = gpsDistance <= maxRadius;

    if (userGps.accuracy > campusConfig.maxGpsAccuracy) {
      gpsStatusMessage = `Low GPS Accuracy (±${Math.round(userGps.accuracy)}m)`;
    } else if (isInsideGeofence) {
      gpsStatusMessage = `Within Perimeter (${gpsDistance}m from center)`;
    } else {
      gpsStatusMessage = `Out of Bounds (${gpsDistance}m - Max ${maxRadius}m)`;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser?.role || null,
        isLoading,
        deviceId,
        campusConfig,
        userGps,
        isSimulatingGps,
        gpsDistance,
        isInsideGeofence,
        gpsStatusMessage,
        login,
        logout,
        refreshConfig,
        setSimulatedGps,
        startRealGps,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
