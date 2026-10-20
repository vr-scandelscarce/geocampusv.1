import React, { useState } from 'react';
import {
  Table,
  Search,
  RotateCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Smartphone,
  MapPin,
  Clock,
  Filter,
} from 'lucide-react';
import type { AttendanceRecord } from '../types/index.js';
import { useAuth } from '../context/AuthContext.js';

interface AttendanceTableProps {
  logs: AttendanceRecord[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const AttendanceTable: React.FC<AttendanceTableProps> = ({
  logs,
  isLoading,
  onRefresh,
}) => {
  const { role } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredLogs = logs.filter((log) => {
    // Search query matching
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      log.session_token.toLowerCase().includes(query) ||
      log.user_id.toLowerCase().includes(query) ||
      log.user_name.toLowerCase().includes(query) ||
      log.course.toLowerCase().includes(query) ||
      log.status.toLowerCase().includes(query);

    // Status filter
    if (statusFilter === 'VERIFIED') return matchesSearch && log.status === 'Verified';
    if (statusFilter === 'REJECTED') return matchesSearch && log.status.startsWith('Rejected');
    if (statusFilter === 'FLAGGED') return matchesSearch && log.status.startsWith('Flagged');

    return matchesSearch;
  });

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
      {/* Table Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {role === 'student' ? 'My Verified Attendance Records' : 'Live Attendance & Audit Records'}
            </h3>
            <p className="text-xs text-slate-500">
              {role === 'student'
                ? 'Your authenticated session check-in logs'
                : 'Real-time telemetry and geofence verification audit trail'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Statuses ({logs.length})</option>
              <option value="VERIFIED">Verified Only</option>
              <option value="REJECTED">Rejected Only</option>
              <option value="FLAGGED">Flagged / Spoofing</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs transition border border-slate-300 flex items-center justify-center shrink-0"
            title="Refresh logs from server"
            aria-label="Refresh attendance logs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto border border-slate-100 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200">
              <th className="p-3">Session Token</th>
              <th className="p-3">Timestamp</th>
              {role !== 'student' && <th className="p-3">Student Name (ID)</th>}
              <th className="p-3">Course</th>
              <th className="p-3">Distance & Accuracy</th>
              {role === 'admin' && <th className="p-3">Coordinates (Lat, Lon)</th>}
              {role === 'admin' && <th className="p-3">Device Fingerprint</th>}
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-normal">
            {filteredLogs.length === 0 ? (
              <tr>
                <td
                  colSpan={role === 'admin' ? 8 : role === 'student' ? 5 : 6}
                  className="p-8 text-center text-slate-400 text-xs"
                >
                  {searchQuery ? 'No attendance records match your search criteria.' : 'No attendance logs recorded yet.'}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isVerified = log.status === 'Verified';
                const isFlagged = log.status.startsWith('Flagged');

                return (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-mono font-bold text-indigo-900 tracking-wider">
                      {log.session_token}
                    </td>

                    <td className="p-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>

                    {role !== 'student' && (
                      <td className="p-3 font-medium text-slate-800">
                        {log.user_name}{' '}
                        <span className="font-mono text-slate-400 text-[10px]">({log.user_id})</span>
                      </td>
                    )}

                    <td className="p-3 font-bold text-slate-700">{log.course}</td>

                    <td className="p-3 font-mono text-slate-600">
                      <span className="font-bold text-slate-800">{log.distance}m</span>{' '}
                      <span className="text-[10px] text-slate-400">(±{log.accuracy}m)</span>
                    </td>

                    {role === 'admin' && (
                      <td className="p-3 font-mono text-slate-500 text-[11px]">
                        {log.lat.toFixed(5)}, {log.lon.toFixed(5)}
                      </td>
                    )}

                    {role === 'admin' && (
                      <td className="p-3 font-mono text-slate-400 text-[10px]">
                        {log.device_id.substring(0, 14)}...
                      </td>
                    )}

                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          isVerified
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isFlagged
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {isVerified ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : isFlagged ? (
                          <AlertTriangle className="w-3 h-3 text-purple-600" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-600" />
                        )}
                        <span>{log.status}</span>
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-[11px] text-slate-400 pt-2">
        <span>Showing {filteredLogs.length} of {logs.length} total records</span>
        <span className="font-medium">Haversine verified on server</span>
      </div>
    </div>
  );
};
