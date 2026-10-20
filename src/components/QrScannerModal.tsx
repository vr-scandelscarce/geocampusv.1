import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle, RefreshCw, Upload } from 'lucide-react';
import { useToast } from '../context/ToastContext.js';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (token: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'geo-qr-reader-container';
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current && isScanning) {
        scannerRef.current
          .stop()
          .then(() => {
            scannerRef.current = null;
            setIsScanning(false);
          })
          .catch(() => {});
      }
      return;
    }

    let isMounted = true;
    setScannerError(null);

    const startScanner = async () => {
      try {
        // Small delay to ensure modal DOM is mounted
        await new Promise((r) => setTimeout(r, 200));
        if (!isMounted) return;

        const html5QrCode = new Html5Qrcode(containerId);
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            const cleanToken = decodedText.trim().toUpperCase();
            // Audio chime / haptic
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate(100);
            }
            showToast(`QR Code detected: ${cleanToken}`, 'success');

            if (scannerRef.current) {
              scannerRef.current.stop().catch(() => {});
            }
            setIsScanning(false);
            onScanSuccess(cleanToken);
            onClose();
          },
          () => {
            // Frame scan failure is normal while searching
          }
        );

        if (isMounted) {
          setIsScanning(true);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Camera scan failed to initialize:', err);
          setScannerError(
            err.message ||
              'Camera access was denied or is not available. Please allow camera permissions or upload an image file of the QR code.'
          );
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isOpen, onScanSuccess, onClose, showToast]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('qr-dummy-canvas');
      const text = await html5QrCode.scanFile(file, true);
      const cleanToken = text.trim().toUpperCase();
      showToast(`QR Code successfully parsed from image: ${cleanToken}`, 'success');
      onScanSuccess(cleanToken);
      onClose();
    } catch {
      showToast('No readable QR code found in the selected image.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 id="qr-scanner-title" className="font-bold text-sm tracking-wide">
                Live QR Code Scanner
              </h3>
              <p className="text-[11px] text-slate-300">Point your camera at instructor's screen</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
            aria-label="Close QR scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner Viewport */}
        <div className="p-5 flex flex-col items-center">
          <div className="relative w-full max-w-[300px] h-[300px] rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center border-2 border-indigo-500 shadow-inner">
            <div id={containerId} className="w-full h-full" />

            {/* Target Reticle Overlay */}
            {isScanning && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-dashed border-indigo-400 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-indigo-500" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-indigo-500" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-indigo-500" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-indigo-500" />
                  {/* Sweep Laser animation */}
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_8px_#f43f5e] animate-bounce mt-24" />
                </div>
              </div>
            )}

            {/* Error or loading state */}
            {scannerError && (
              <div className="p-4 text-center z-10 bg-slate-900/90 text-slate-200 m-3 rounded-lg text-xs space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="font-medium text-amber-300">Camera Unavailable</p>
                <p className="text-[11px] opacity-80 leading-relaxed">{scannerError}</p>
              </div>
            )}

            {!isScanning && !scannerError && (
              <div className="text-center text-slate-400 text-xs space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
                <p>Initializing camera device...</p>
              </div>
            )}
          </div>

          <div id="qr-dummy-canvas" className="hidden" />

          {/* Action Tools */}
          <div className="w-full mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
            <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer transition">
              <Upload className="w-4 h-4 text-slate-500" />
              <span>Scan QR Image File</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
