import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Fingerprint,
  Camera,
  MapPin,
  CheckCircle2,
  XCircle,
  FileText,
  Upload,
  Calendar,
  Send,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { api } from '../lib/api.js';
import { QrScannerModal } from './QrScannerModal.js';
import { GpsSimulatorModal } from './GpsSimulatorModal.js';
import type { OdRequest, AttendanceRecord } from '../types/index.js';
import confetti from 'canvas-confetti';

interface StudentPortalProps {
  onCheckInSuccess: () => void;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({ onCheckInSuccess }) => {
  const {
    currentUser,
    userGps,
    gpsDistance,
    isInsideGeofence,
    campusConfig,
    deviceId,
    isSimulatingGps,
  } = useAuth();
  const { showToast } = useToast();

  const [sessionToken, setSessionToken] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isGpsSimOpen, setIsGpsSimOpen] = useState<boolean>(false);
  const [lastCheckinResult, setLastCheckinResult] = useState<AttendanceRecord | null>(null);

  // OD Request Form state
  const [odReason, setOdReason] = useState<string>('');
  const [odDate, setOdDate] = useState<string>('');
  const [odFile, setOdFile] = useState<File | null>(null);
  const [isSubmittingOd, setIsSubmittingOd] = useState<boolean>(false);
  const [myOdRequests, setMyOdRequests] = useState<OdRequest[]>([]);
  const [isLoadingOd, setIsLoadingOd] = useState<boolean>(true);

  // Fetch student's OD requests
  const loadMyOd = async () => {
    try {
      const res = await api.getMyOdRequests();
      setMyOdRequests(res);
    } catch (err: any) {
      console.warn('Could not fetch OD requests:', err);
    } finally {
      setIsLoadingOd(false);
    }
  };

  useEffect(() => {
    loadMyOd();
  }, []);

  const handlePerformCheckIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const token = sessionToken.trim().toUpperCase();

    if (!token) {
      showToast('Please enter or scan a valid session token.', 'warning');
      return;
    }

    if (!userGps) {
      showToast('GPS position not acquired yet. Please wait a moment or click GPS Test Bench.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.checkIn({
        token,
        lat: userGps.lat,
        lon: userGps.lon,
        accuracy: userGps.accuracy,
        deviceId,
      });

      if (res.success && res.record) {
        setLastCheckinResult(res.record);
        setSessionToken('');
        showToast(`Attendance verified for ${res.record.course}! Distance: ${res.distance}m.`, 'success', 'Verified');
        try {
          confetti({
            particleCount: 60,
            spread: 60,
            origin: { y: 0.8 },
          });
        } catch {}
        onCheckInSuccess();
      }
    } catch (err: any) {
      showToast(err.message || 'Check-in validation failed.', 'error', 'Check-In Rejected');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitOd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!odReason.trim() || !odDate) {
      showToast('Please provide an event reason and date.', 'warning');
      return;
    }

    setIsSubmittingOd(true);
    try {
      const res = await api.submitOd(odReason, odDate, odFile);
      showToast('On-Duty (OD) request submitted for faculty approval!', 'success');
      setOdReason('');
      setOdDate('');
      setOdFile(null);
      loadMyOd();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit OD request', 'error');
    } finally {
      setIsSubmittingOd(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Check-in Station (Bug 3, Bug 8, Bug 14) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                  <QrCode className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Student Check-In Station</h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsGpsSimOpen(true)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition flex items-center gap-1.5"
                  title="Open GPS Testing Bench"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>GPS Test Bench</span>
                  {isSimulatingGps && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  )}
                </button>

                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    userGps
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                  }`}
                >
                  {userGps ? 'GPS Fix Acquired' : 'Locating...'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Verify your physical attendance inside the campus geofence perimeter. Use your device camera
              to scan the instructor's rotating QR code or enter the active token code.
            </p>

            {/* Live GPS Telemetry Card */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 mb-6 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> Current Coordinates:
                </span>
                <span className="font-mono text-xs bg-white px-2.5 py-1 rounded border border-slate-200 text-slate-800 font-semibold shadow-xs">
                  {userGps
                    ? `${userGps.lat.toFixed(5)}, ${userGps.lon.toFixed(5)} (±${Math.round(userGps.accuracy)}m)`
                    : 'Acquiring GPS fix...'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Distance from Campus Center:</span>
                <span className="font-mono text-xs bg-white px-2.5 py-1 rounded border border-slate-200 text-slate-800 font-semibold shadow-xs">
                  {gpsDistance !== null ? `${gpsDistance} meters` : 'Calculating...'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Geofence Status:</span>
                <span
                  aria-live="polite"
                  className={`font-bold text-xs px-2.5 py-1 rounded border ${
                    isInsideGeofence
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : 'text-rose-700 bg-rose-50 border-rose-200'
                  }`}
                >
                  {isInsideGeofence ? '✓ Inside Perimeter (Authorized)' : '✗ Outside Perimeter'}
                </span>
              </div>
            </div>

            {/* Check-In Controls */}
            <form onSubmit={handlePerformCheckIn} className="space-y-4">
              <div>
                <label
                  htmlFor="sessionTokenInput"
                  className="block text-xs font-semibold uppercase text-slate-500 mb-1.5"
                >
                  Enter Session Code or Scan QR
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      id="sessionTokenInput"
                      type="text"
                      value={sessionToken}
                      onChange={(e) => setSessionToken(e.target.value.toUpperCase())}
                      placeholder="e.g. CS301-839201"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-wider focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none uppercase shadow-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 shadow-xs"
                    aria-label="Open Camera QR Scanner"
                  >
                    <Camera className="w-4 h-4 text-indigo-300" />
                    <span>Scan QR</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || !sessionToken.trim()}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>{isSubmitting ? 'Verifying...' : 'Check In'}</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Last Check-in Result card */}
            {lastCheckinResult && (
              <div className="mt-5 p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-emerald-950 mb-0.5">
                    Attendance Verified: {lastCheckinResult.course}
                  </div>
                  <p className="text-emerald-800">
                    Session <span className="font-mono font-semibold">{lastCheckinResult.session_token}</span> confirmed at{' '}
                    {lastCheckinResult.distance}m from center. Recorded securely in university audit logs.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Server-side Haversine verification
            </span>
            <span className="font-mono">Device: {deviceId.substring(0, 14)}...</span>
          </div>
        </div>

        {/* Apply for On-Duty (OD) Widget (Bug 12) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Apply for On-Duty (OD)</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Upload official event proof for hackathons, sports, or academic duties.
            </p>

            <form onSubmit={handleSubmitOd} className="space-y-3.5">
              <div>
                <label
                  htmlFor="odReason"
                  className="block text-xs font-semibold uppercase text-slate-500 mb-1"
                >
                  Event / Activity Reason
                </label>
                <input
                  id="odReason"
                  type="text"
                  required
                  value={odReason}
                  onChange={(e) => setOdReason(e.target.value)}
                  placeholder="e.g. Smart India Hackathon"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="odDate"
                  className="block text-xs font-semibold uppercase text-slate-500 mb-1"
                >
                  Event Date
                </label>
                <input
                  id="odDate"
                  type="date"
                  required
                  value={odDate}
                  onChange={(e) => setOdDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="odProofFile"
                  className="block text-xs font-semibold uppercase text-slate-500 mb-1"
                >
                  Supporting Proof (PDF or Image, max 2MB)
                </label>
                <input
                  id="odProofFile"
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  onChange={(e) => setOdFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingOd}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmittingOd ? 'Uploading Proof...' : 'Submit OD Application'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Student's My OD Requests List (Bug 12) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">My On-Duty (OD) Applications</h4>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {myOdRequests.length} Total Submissions
          </span>
        </div>

        {myOdRequests.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
            You haven't submitted any On-Duty requests yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
            {myOdRequests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:bg-slate-50/50 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{req.reason}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        req.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : req.status === 'Rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px]">
                    Event Date: <span className="font-semibold text-slate-700">{req.date}</span>
                    {req.decision_notes && (
                      <span className="ml-2 italic text-slate-600">
                        • Notes: "{req.decision_notes}"
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {req.proof_filename ? (
                    <a
                      href={`/api/uploads/${req.proof_filename}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium flex items-center gap-1 transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View Proof</span>
                    </a>
                  ) : req.proof_original_name ? (
                    <span className="text-[11px] text-slate-400 italic">
                      {req.proof_original_name}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QR Scanner Modal (Bug 8) */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(token) => {
          setSessionToken(token);
          // Auto-checkin upon QR recognition
          setTimeout(() => {
            const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
            if (btn) btn.click();
          }, 300);
        }}
      />

      {/* GPS Simulation Laboratory */}
      <GpsSimulatorModal isOpen={isGpsSimOpen} onClose={() => setIsGpsSimOpen(false)} />
    </div>
  );
};
