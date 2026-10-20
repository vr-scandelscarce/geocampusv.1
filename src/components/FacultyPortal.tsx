import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Plus,
  RefreshCw,
  Clock,
  ClipboardCheck,
  CheckCircle,
  XCircle,
  ExternalLink,
  BookOpen,
  Radio,
  FileText,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { api } from '../lib/api.js';
import type { ClassSession, OdRequest } from '../types/index.js';

interface FacultyPortalProps {
  onSessionUpdated: () => void;
}

export const FacultyPortal: React.FC<FacultyPortalProps> = ({ onSessionUpdated }) => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [courseCode, setCourseCode] = useState<string>('CS301');
  const [durationSec, setDurationSec] = useState<number>(45);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [activeSession, setActiveSession] = useState<ClassSession | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // OD Requests
  const [odRequests, setOdRequests] = useState<OdRequest[]>([]);
  const [isLoadingOd, setIsLoadingOd] = useState<boolean>(true);
  const [decisionNotes, setDecisionNotes] = useState<Record<number, string>>({});

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load Faculty Active Session
  const loadActiveSession = useCallback(async () => {
    try {
      const res = await api.getFacultyActiveSession();
      if (res.session) {
        setActiveSession(res.session);
        setCourseCode(res.session.course);
        const remaining = Math.max(0, Math.ceil((res.session.expires_at - Date.now()) / 1000));
        setTimeLeft(remaining);
      }
    } catch (err: any) {
      console.warn('Could not fetch active session:', err);
    }
  }, []);

  // Load Pending OD Requests (Bug 11)
  const loadOdRequests = useCallback(async () => {
    try {
      const res = await api.getAllOdRequests();
      setOdRequests(res);
    } catch (err: any) {
      console.warn('Could not fetch OD requests:', err);
    } finally {
      setIsLoadingOd(false);
    }
  }, []);

  useEffect(() => {
    loadActiveSession();
    loadOdRequests();
  }, [loadActiveSession, loadOdRequests]);

  // Render QR Code onto canvas whenever activeSession token changes
  useEffect(() => {
    if (!canvasRef.current) return;

    if (activeSession && activeSession.token) {
      QRCode.toCanvas(
        canvasRef.current,
        activeSession.token,
        {
          width: 170,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        },
        (err) => {
          if (err) console.error('Failed to draw QR code:', err);
        }
      );
    } else {
      // Clear canvas
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [activeSession]);

  // Handle Token Countdown and Auto-Rotation (Bug 9)
  useEffect(() => {
    if (!activeSession) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((activeSession.expires_at - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        if (autoRotate) {
          handleRotateSession();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession, autoRotate]);

  const handleGenerateSession = async () => {
    const course = courseCode.trim().toUpperCase() || 'CS301';
    setIsGenerating(true);

    try {
      const session = await api.createSession(course, durationSec, autoRotate);
      setActiveSession(session);
      setTimeLeft(durationSec);
      showToast(`Dynamic session token ${session.token} generated! Valid for ${durationSec}s.`, 'success');
      onSessionUpdated();
    } catch (err: any) {
      showToast(err.message || 'Failed to create session.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRotateSession = async () => {
    if (!activeSession) return;
    try {
      const updated = await api.rotateSession(activeSession.id, activeSession.course);
      setActiveSession(updated);
      setTimeLeft(Math.max(0, Math.ceil((updated.expires_at - Date.now()) / 1000)));
      showToast(`Token auto-rotated to ${updated.token} (previous token accepted for grace period)`, 'info');
      onSessionUpdated();
    } catch (err: any) {
      console.warn('Auto rotation error:', err);
    }
  };

  const handleOdDecision = async (id: number, decision: 'Approved' | 'Rejected') => {
    try {
      const notes = decisionNotes[id];
      await api.decideOd(id, decision, notes);
      showToast(`OD Request #${id} was marked as ${decision}.`, decision === 'Approved' ? 'success' : 'info');
      loadOdRequests();
      onSessionUpdated();
    } catch (err: any) {
      showToast(err.message || 'Failed to update OD decision.', 'error');
    }
  };

  const pendingOdList = odRequests.filter((r) => r.status === 'Pending');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* QR Generator & Session Manager (Bug 4, Bug 9, Bug 14) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Live Dynamic Session Generator</h3>
                  <p className="text-xs text-slate-500">
                    Cryptographic single-use tokens & rotating scannable QR codes
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateSession}
                disabled={isGenerating}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>{isGenerating ? 'Generating...' : 'New Session'}</span>
              </button>
            </div>

            {/* Session Settings Bar */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <label htmlFor="courseCodeInput" className="font-semibold text-slate-600">
                  Course Code:
                </label>
                <input
                  id="courseCodeInput"
                  type="text"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                  placeholder="e.g. CS301"
                  className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-800 uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="durationSelect" className="font-semibold text-slate-600">
                  Expiry:
                </label>
                <select
                  id="durationSelect"
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                  <option value={60}>60 seconds</option>
                  <option value={90}>90 seconds</option>
                </select>
              </div>

              {/* Auto-Rotate Switch (Bug 9) */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRotate}
                  onChange={(e) => setAutoRotate(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 relative"></div>
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Radio className={`w-3 h-3 ${autoRotate ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`} />
                  Auto-Rotate Tokens
                </span>
              </label>
            </div>

            {/* Display Canvas & Active Token Area */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center bg-gradient-to-br from-slate-50 to-indigo-50/40 p-6 rounded-2xl border border-slate-200">
              <div className="space-y-4">
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Active Session Token
                  </span>
                  <div
                    aria-live="polite"
                    className="font-mono text-2xl font-black text-indigo-700 tracking-wider"
                  >
                    {activeSession ? activeSession.token : 'NO ACTIVE SESSION'}
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Token Expiration Status
                  </span>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span
                      aria-live="polite"
                      className={`text-sm font-bold font-mono ${
                        timeLeft <= 10 && timeLeft > 0
                          ? 'text-rose-600 animate-pulse'
                          : timeLeft > 0
                          ? 'text-indigo-600'
                          : 'text-slate-400'
                      }`}
                    >
                      {timeLeft > 0 ? `${timeLeft}s remaining` : 'Expired (Ready for next rotation)'}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full transition-all duration-1000 ease-linear rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, (timeLeft / (durationSec || 60)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {activeSession && (
                  <button
                    type="button"
                    onClick={handleRotateSession}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Rotate Token Immediately</span>
                  </button>
                )}
              </div>

              {/* Scannable Canvas QR Code */}
              <div className="flex flex-col items-center justify-center bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="w-[170px] h-[170px] flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 overflow-hidden relative">
                  <canvas ref={canvasRef} className="w-[170px] h-[170px]" />
                  {!activeSession && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center text-xs text-slate-400 space-y-1">
                      <QrCode className="w-8 h-8 text-slate-300" />
                      <span>Click 'New Session' to generate scannable QR</span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-slate-500 mt-2 flex items-center gap-1">
                  Students scan this QR code with mobile camera
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* OD Requests Approval Widget (Bug 11, Bug 12) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Pending OD Approvals</h3>
                  <p className="text-xs text-slate-500">Student On-Duty verification queue</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {pendingOdList.length} Pending
              </span>
            </div>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {pendingOdList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">
                  No pending On-Duty requests awaiting review.
                </p>
              ) : (
                pendingOdList.map((req) => (
                  <div
                    key={req.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs"
                  >
                    <div className="flex justify-between items-start gap-1">
                      <div>
                        <div className="font-bold text-slate-800 text-xs">
                          {req.user_name} <span className="font-mono text-slate-400">({req.user_id})</span>
                        </div>
                        <p className="text-slate-600 font-medium">{req.reason}</p>
                      </div>
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                        Pending
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Event Date: {req.date}</span>
                      {req.proof_filename && (
                        <a
                          href={`/api/uploads/${req.proof_filename}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>View Proof</span>
                        </a>
                      )}
                    </div>

                    {/* Decision Buttons */}
                    <div className="pt-2 border-t border-slate-200 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleOdDecision(req.id, 'Approved')}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition flex items-center justify-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Approve OD</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOdDecision(req.id, 'Rejected')}
                        className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] transition flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
