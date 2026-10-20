import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Shield,
  Save,
  Download,
  Upload,
  Layers,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileCode,
  Sparkles,
  History,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { api } from '../lib/api.js';

interface AdminPortalProps {
  onConfigUpdated: () => void;
  onImportSuccess: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  onConfigUpdated,
  onImportSuccess,
}) => {
  const { campusConfig, refreshConfig } = useAuth();
  const { showToast } = useToast();

  const [lat, setLat] = useState<string>('13.0827');
  const [lon, setLon] = useState<string>('80.2707');
  const [radius, setRadius] = useState<string>('50');
  const [maxAccuracy, setMaxAccuracy] = useState<string>('50');
  const [tolerance, setTolerance] = useState<string>('5');
  const [campusName, setCampusName] = useState<string>('CIT Central Academic Quadrangle');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);

  const loadAuditLogs = async () => {
    setIsLoadingAudit(true);
    try {
      const logs = await api.getAuditLogs();
      setAuditLogs(logs);
    } catch (err: any) {
      showToast(err.message || 'Could not load security audit logs.', 'error');
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (campusConfig) {
      setLat(String(campusConfig.lat));
      setLon(String(campusConfig.lon));
      setRadius(String(campusConfig.radius));
      setMaxAccuracy(String(campusConfig.maxGpsAccuracy));
      setTolerance(String(campusConfig.allowToleranceMeters || 5));
      if (campusConfig.campusName) setCampusName(campusConfig.campusName);
    }
  }, [campusConfig]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const numLat = parseFloat(lat);
    const numLon = parseFloat(lon);
    const numRadius = parseFloat(radius);
    const numMaxAcc = parseFloat(maxAccuracy);
    const numTol = Math.min(parseFloat(tolerance), 10); // Max 10m tolerance (Bug 5)

    if (isNaN(numLat) || isNaN(numLon) || isNaN(numRadius) || numRadius <= 0) {
      showToast('Please provide valid numerical coordinates and a positive radius.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await api.updateConfig({
        lat: numLat,
        lon: numLon,
        radius: numRadius,
        maxGpsAccuracy: numMaxAcc,
        allowToleranceMeters: numTol,
        campusName,
      });
      await refreshConfig();
      showToast('Campus geofence perimeter and security tolerances updated successfully!', 'success');
      onConfigUpdated();
    } catch (err: any) {
      showToast(err.message || 'Failed to save geofence configuration.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Import Excel or JSON Handler (Bug 13)
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const fileName = file.name.toLowerCase();

    try {
      if (fileName.endsWith('.json')) {
        const text = await file.text();
        const records = JSON.parse(text);
        if (!Array.isArray(records)) {
          throw new Error('Invalid JSON format: expected an array of attendance record objects.');
        }

        const result = await api.importAttendance(records);
        showToast(
          `Imported ${result.imported} records (${result.skipped} skipped duplicates).`,
          result.errors.length > 0 ? 'warning' : 'success',
          'Import Complete'
        );
        onImportSuccess();
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonSheetData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonSheetData.length === 0) {
          throw new Error('The uploaded Excel spreadsheet contains no data rows.');
        }

        const result = await api.importAttendance(jsonSheetData);
        showToast(
          `Imported ${result.imported} records from Excel (${result.skipped} duplicates skipped).`,
          result.errors.length > 0 ? 'warning' : 'success',
          'Excel Import Complete'
        );
        onImportSuccess();
      } else {
        throw new Error('Unsupported format. Please select an Excel (.xlsx, .xls) or .json file.');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to parse import file.', 'error', 'Import Error');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  // Export to Excel (SheetJS)
  const handleExportExcel = async () => {
    try {
      const logs = await api.getAttendanceLogs();
      const mapped = logs.map((l) => ({
        'Session Token': l.session_token,
        'Timestamp': new Date(l.created_at).toLocaleString(),
        'Student ID': l.user_id,
        'Student Name': l.user_name,
        'Course Code': l.course,
        'Latitude': l.lat,
        'Longitude': l.lon,
        'Distance (m)': l.distance,
        'GPS Accuracy (m)': l.accuracy,
        'Device Hardware ID': l.device_id,
        'Status': l.status,
      }));

      const worksheet = XLSX.utils.json_to_sheet(mapped);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Audit Log');
      XLSX.writeFile(workbook, `GeoCampus_Attendance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Attendance report exported to Excel successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Export failed.', 'error');
    }
  };

  // Export to JSON
  const handleExportJson = async () => {
    try {
      const logs = await api.getAttendanceLogs();
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `GeoCampus_Attendance_Audit_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Attendance JSON audit logs exported successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Export failed.', 'error');
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
      {/* Header and Quick Export/Import Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">System Geofence & Perimeter Administration</h3>
            <p className="text-xs text-slate-500">
              Configure GPS boundaries, strict Haversine tolerances, and audit reports
            </p>
          </div>
        </div>

        {/* Export / Import Button Group (Bug 11: Admin only) */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold cursor-pointer transition border border-indigo-200 flex items-center gap-1.5 shadow-xs">
            <Upload className="w-3.5 h-3.5" />
            <span>{isImporting ? 'Validating...' : 'Import Excel / JSON'}</span>
            <input
              type="file"
              accept=".xlsx,.xls,.json"
              onChange={handleFileImport}
              disabled={isImporting}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel (SheetJS)</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={() => {
              loadAuditLogs();
              setShowAuditModal(true);
            }}
            className="px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            <History className="w-3.5 h-3.5" />
            <span>Security Audit Log</span>
          </button>
        </div>
      </div>

      {/* Geofence Parameters Form */}
      <form onSubmit={handleSaveConfig} className="space-y-6">
        <div>
          <label htmlFor="campusNameInput" className="block text-xs font-semibold uppercase text-slate-500 mb-1">
            Campus Landmark / Zone Name
          </label>
          <input
            id="campusNameInput"
            type="text"
            value={campusName}
            onChange={(e) => setCampusName(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <label htmlFor="configLat" className="block text-xs font-bold text-slate-700">
              Campus Center Latitude
            </label>
            <input
              id="configLat"
              type="text"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400">e.g. 13.0827 (Chennai Quad)</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <label htmlFor="configLon" className="block text-xs font-bold text-slate-700">
              Campus Center Longitude
            </label>
            <input
              id="configLon"
              type="text"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400">e.g. 80.2707 (Chennai Quad)</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <label htmlFor="configRadius" className="block text-xs font-bold text-slate-700">
              Geofence Radius (Meters)
            </label>
            <input
              id="configRadius"
              type="number"
              min="10"
              max="1000"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400">Strict perimeter (default: 50m)</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <label htmlFor="configMaxAcc" className="block text-xs font-bold text-slate-700">
              Max GPS Accuracy Cutoff
            </label>
            <input
              id="configMaxAcc"
              type="number"
              min="15"
              max="150"
              value={maxAccuracy}
              onChange={(e) => setMaxAccuracy(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400">Rejects &gt; cutoff (default: 50m)</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <label htmlFor="configTolerance" className="block text-xs font-bold text-slate-700">
              Boundary Tolerance (m)
            </label>
            <input
              id="configTolerance"
              type="number"
              min="0"
              max="10"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400">Max 10m buffer (Bug 5)</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs"
          >
            <Save className="w-4 h-4 text-emerald-400" />
            <span>{isSaving ? 'Updating Database...' : 'Save Geofence Parameters'}</span>
          </button>

          <span className="text-xs text-slate-500">
            Strict perimeter enforcement active: total allowed distance = {parseFloat(radius) + Math.min(parseFloat(tolerance) || 0, 10)}m
          </span>
        </div>
      </form>

      {/* Security Audit Trail Modal */}
      {showAuditModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-600 rounded-lg">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 id="audit-modal-title" className="font-bold text-sm">
                    Institutional Security &amp; Telemetry Audit Trail
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Immutable event logs: authentication, spoofing alerts, geofence validations
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadAuditLogs}
                  disabled={isLoadingAudit}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition"
                >
                  {isLoadingAudit ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuditModal(false)}
                  className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
                  aria-label="Close Audit Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-3">
              {auditLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  {isLoadingAudit ? 'Loading security records...' : 'No audit entries found in database.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                  {auditLogs.map((entry) => {
                    let badgeClass = 'bg-slate-100 text-slate-700';
                    if (entry.event.includes('FAILED') || entry.event.includes('REJECTED')) {
                      badgeClass = 'bg-rose-100 text-rose-800 border-rose-200';
                    } else if (entry.event.includes('SUCCESS') || entry.event.includes('VERIFIED')) {
                      badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                    } else if (entry.event.includes('CONFIG') || entry.event.includes('SESSION')) {
                      badgeClass = 'bg-indigo-100 text-indigo-800 border-indigo-200';
                    }

                    return (
                      <div key={entry.id} className="p-3.5 hover:bg-slate-50 transition flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] border ${badgeClass}`}>
                              {entry.event}
                            </span>
                            {entry.user_id && (
                              <span className="font-mono text-slate-500 font-semibold text-[11px]">
                                User: {entry.user_id}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-700 text-xs font-medium">{entry.details}</p>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-500">
              <span>Showing last {auditLogs.length} security events stored in SQLite relational database</span>
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
