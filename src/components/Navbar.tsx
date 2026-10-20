import React, { useState } from 'react';
import {
  Compass,
  LogOut,
  User as UserIcon,
  Sparkles,
  ShieldCheck,
  GraduationCap,
  Briefcase,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { GpsSimulatorModal } from './GpsSimulatorModal.js';

export const Navbar: React.FC = () => {
  const { currentUser, role, logout, isSimulatingGps } = useAuth();
  const [isGpsModalOpen, setIsGpsModalOpen] = useState<boolean>(false);

  return (
    <>
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-40 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          {/* Logo Brand Button (Bug 17) */}
          <button
            type="button"
            className="flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg p-1"
            aria-label="GeoCampus Hybrid Attendance System Home"
          >
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md shadow-indigo-600/30">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight">GeoCampus</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  v2.4 Protected
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Hybrid Attendance &amp; Geofencing System
              </p>
            </div>
          </button>

          {/* User Profile & Actions */}
          {currentUser && (
            <div className="flex items-center gap-3">
              {/* GPS Test bench quick trigger */}
              <button
                type="button"
                onClick={() => setIsGpsModalOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                title="Open GPS Testing Bench"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>GPS Tester</span>
                {isSimulatingGps && (
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                )}
              </button>

              {/* User badge */}
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs">
                {role === 'student' ? (
                  <GraduationCap className="w-4 h-4 text-indigo-400" />
                ) : role === 'faculty' ? (
                  <Briefcase className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                )}
                <div className="hidden md:block">
                  <span className="font-bold text-slate-100">{currentUser.name}</span>{' '}
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    ({role})
                  </span>
                </div>
              </div>

              {/* Logout button */}
              <button
                type="button"
                onClick={logout}
                className="px-3 py-1.5 bg-rose-600/90 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                aria-label="Sign out of GeoCampus"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <GpsSimulatorModal isOpen={isGpsModalOpen} onClose={() => setIsGpsModalOpen(false)} />
    </>
  );
};
