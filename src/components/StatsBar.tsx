import React from 'react';
import {
  CalendarCheck,
  MapPin,
  FileText,
  Clock,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import type { SystemStats } from '../types/index.js';

interface StatsBarProps {
  stats: SystemStats | null;
  isLoading: boolean;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats, isLoading }) => {
  const { isInsideGeofence, gpsStatusMessage, userGps, campusConfig } = useAuth();

  const attendanceRate = stats ? `${stats.attendanceRate}%` : '---';
  const activeSessions = stats ? stats.activeSessions : 0;
  const pendingOd = stats ? stats.pendingOdRequests : 0;
  const verifiedCount = stats ? stats.verifiedCount : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Attendance Rate */}
      <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-100 flex items-center gap-4">
        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
          <CalendarCheck className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Attendance Rate
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-black text-slate-800">
              {isLoading ? '...' : attendanceRate}
            </h3>
            <span className="text-[11px] font-semibold text-slate-500">
              ({verifiedCount} verified)
            </span>
          </div>
        </div>
      </div>

      {/* Real GPS Geofence Status */}
      <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-100 flex items-center gap-4">
        <div
          className={`p-3 rounded-xl shrink-0 ${
            isInsideGeofence
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-rose-50 text-rose-600'
          }`}
        >
          <MapPin className="w-6 h-6" />
        </div>
        <div className="overflow-hidden">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            GPS Geofence Status
          </p>
          <h3
            className={`text-sm font-bold truncate ${
              isInsideGeofence ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {userGps ? gpsStatusMessage : 'Acquiring GPS Fix...'}
          </h3>
          <p className="text-[10px] text-slate-400 font-mono">
            Perimeter: {campusConfig?.radius || 50}m
          </p>
        </div>
      </div>

      {/* Pending OD Requests */}
      <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-100 flex items-center gap-4">
        <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
          <FileText className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Pending OD Requests
          </p>
          <h3 className="text-2xl font-black text-slate-800">
            {isLoading ? '...' : pendingOd}
          </h3>
          <p className="text-[10px] text-slate-400 font-medium">Awaiting Faculty Action</p>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-100 flex items-center gap-4">
        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Active Class Sessions
          </p>
          <h3 className="text-2xl font-black text-slate-800">
            {isLoading ? '...' : activeSessions}
          </h3>
          <p className="text-[10px] text-slate-400 font-medium">Live QR Tokens Generating</p>
        </div>
      </div>
    </div>
  );
};
