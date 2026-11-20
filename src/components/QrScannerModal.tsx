import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Upload, X } from 'lucide-react';
import { parsePairingInput } from '../utils/pairing';

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onCodeDetected: (code: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  open,
  onClose,
  onCodeDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanHint, setScanHint] = useState<string>(
    'Point your camera at a KepokDesk QR code or upload a QR screenshot.'
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;

    async function startCamera() {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera capture is unavailable here. Upload a QR code image instead.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scanFrame = () => {
          if (cancelled) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const qr = jsQR(imgData.data, imgData.width, imgData.height);
              if (qr?.data) {
                const parsed = parsePairingInput(qr.data);
                if (parsed) {
                  onCodeDetected(parsed);
                  onClose();
                  return;
                }
                setScanHint('QR detected, but it does not contain a KepokDesk pairing code.');
              }
            }
          }
          rafId = requestAnimationFrame(scanFrame);
        };
        rafId = requestAnimationFrame(scanFrame);
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? `Camera unavailable: ${err.message}. You can upload a QR image below.`
            : 'Camera permission denied. Upload a QR image instead.'
        );
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [open, onClose, onCodeDetected]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(imgData.data, imgData.width, imgData.height);
        URL.revokeObjectURL(url);
        if (qr?.data) {
          const parsed = parsePairingInput(qr.data);
          if (parsed) {
            onCodeDetected(parsed);
            onClose();
            return;
          }
        }
        setScanHint('No valid KepokDesk QR code found in the selected image.');
      } else {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setScanHint('Could not read the selected image file.');
    };
    img.src = url;
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111214]/75 p-4"
    >
      <div className="w-full max-w-md rounded-[2px] border border-[#111214] bg-white p-6">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#D6D6CE]">
          <div className="flex items-center gap-2.5">
            <Camera className="h-5 w-5 text-[#D9381E]" aria-hidden="true" />
            <h2 id="qr-scanner-title" className="font-display text-base font-semibold text-[#111214]">
              Scan Peer QR Code
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR scanner"
            className="rounded-[2px] p-1.5 text-[#4B5058] hover:bg-[#F7F7F4] hover:text-[#111214] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-[2px] border border-[#D6D6CE] bg-[#141619] flex items-center justify-center">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#141619]">
                <p className="text-sm text-[#E5E7EB] leading-relaxed">{cameraError}</p>
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-[#4B5058] leading-relaxed">{scanHint}</p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              aria-label="Upload QR code image"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[2px] border border-[#111214] bg-[#F7F7F4] px-4 py-2.5 text-sm font-medium text-[#111214] hover:bg-[#111214] hover:text-white transition-colors"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload QR Image
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[2px] border border-[#D6D6CE] bg-white px-4 py-2.5 text-sm font-medium text-[#4B5058] hover:border-[#111214] hover:text-[#111214] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
