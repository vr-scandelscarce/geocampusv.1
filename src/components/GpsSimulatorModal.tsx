import React from 'react';
import { Compass, Check, AlertOctagon, Navigation, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

interface GpsSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GpsSimulatorModal: React.FC<GpsSimulatorModalProps> = ({ isOpen, onClose }) => {
  const { campusConfig, setSimulatedGps, startRealGps, isSimulatingGps, userGps } = useAuth();

  if (!isOpen || !campusConfig) return null;

  const campusLat = campusConfig.lat;
  const campusLon = campusConfig.lon;

  const presets = [
    {
      label: 'Campus Center Benchmark',
      description: 'Exact central lawn coordinates (~2 meters distance). Should be Verified.',
      lat: campusLat + 0.00001,
      lon: campusLon + 0.00001,
      accuracy: 5.0,
      badge: 'Inside (Verified)',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    {
      label: 'Academic Block B (Inside Perimeter)',
      description: 'Campus classroom hallway (~28 meters from center). Inside 50m radius.',
      lat: campusLat + 0.00022,
      lon: campusLon + 0.00015,
      accuracy: 8.5,
      badge: 'Inside (Verified)',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    {
      label: 'Outside Campus Gate (Out of Bounds)',
      description: 'Off-campus cafe on highway (~380 meters away). Server must reject.',
      lat: campusLat + 0.0032,
      lon: campusLon + 0.0028,
      accuracy: 12.0,
      badge: 'Out of Bounds (Rejected)',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
    },
    {
      label: 'Weak GPS Signal Test',
      description: 'Inside perimeter, but GPS accuracy is ±85m (> 50m max allowed).',
      lat: campusLat + 0.00005,
      lon: campusLon + 0.00005,
      accuracy: 85.0,
      badge: 'Weak Accuracy (Rejected)',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    {
      label: 'Mock Location Spoofing Test',
      description: 'Simulate mock-location provider anomaly (accuracy === 0m).',
      lat: campusLat,
      lon: campusLon,
      accuracy: 0.0,
      badge: 'Anti-Spoof Flagged',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gps-sim-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Compass className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 id="gps-sim-title" className="font-bold text-sm">
                Campus GPS Testing Laboratory
              </h3>
              <p className="text-[11px] text-slate-300">
                Easily simulate being inside or outside campus geofence perimeter
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
            aria-label="Close GPS tester"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Coordinates Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500 font-medium">Active Coordinates:</span>{' '}
            <span className="font-mono font-bold text-slate-800">
              {userGps ? `${userGps.lat.toFixed(5)}, ${userGps.lon.toFixed(5)}` : 'Not acquired'}
            </span>{' '}
            <span className="text-slate-400">
              (±{userGps?.accuracy !== undefined ? Math.round(userGps.accuracy) : '?'}m)
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              isSimulatingGps
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {isSimulatingGps ? 'Simulated Active' : 'Real Hardware GPS'}
          </span>
        </div>

        {/* Preset Locations */}
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-slate-600 mb-2">
            Campus center is set at{' '}
            <span className="font-mono font-semibold text-slate-800">
              {campusLat}, {campusLon}
            </span>{' '}
            with radius <span className="font-semibold text-slate-800">{campusConfig.radius}m</span>. Click any scenario to test:
          </p>

          {presets.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setSimulatedGps({
                  lat: preset.lat,
                  lon: preset.lon,
                  accuracy: preset.accuracy,
                  altitude: 10,
                  timestamp: Date.now(),
                });
                onClose();
              }}
              className="w-full text-left p-3.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition group flex items-start justify-between gap-3 bg-white"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-800 group-hover:text-indigo-700">
                    {preset.label}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${preset.badgeColor}`}
                  >
                    {preset.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{preset.description}</p>
                <div className="text-[10px] font-mono text-slate-400">
                  {preset.lat.toFixed(5)}, {preset.lon.toFixed(5)} • ±{preset.accuracy}m accuracy
                </div>
              </div>
              <Sparkles className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 shrink-0 mt-1" />
            </button>
          ))}

          {/* Reset to Real Hardware GPS */}
          <button
            type="button"
            onClick={() => {
              startRealGps();
              onClose();
            }}
            className="w-full mt-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-xl text-xs transition flex items-center justify-center gap-2 border border-slate-300"
          >
            <Navigation className="w-4 h-4 text-emerald-600" />
            <span>Switch Back to Real Device GPS (Browser Geolocation)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
