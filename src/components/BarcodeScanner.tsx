// Pemindai barcode kamera. Jalur utama: BarcodeDetector API bawaan
// browser (native, cepat, hemat CPU di laptop kentang). Fallback:
// ZXing (@zxing/browser) kalau browser tidak mendukung.
// Performa (sesuai spesifikasi): resolusi 640x480, scan tiap 250ms
// (bukan tiap frame), hanya format EAN-13 + Code 128, berhenti
// 1,5 detik setelah berhasil baca supaya tidak double-scan.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { BigButton } from './ui';
import { playScanBeep } from '../lib/beep';

// Tipe BarcodeDetector belum ada di lib DOM TS, deklarasi sendiri.
interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
}
interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
}
interface BarcodeDetectorCtor {
  new (options: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

interface Props {
  onDetected: (barcode: string) => void;
  onManual: () => void;
  paused: boolean; // true saat kartu produk sudah tampil
}

export default function BarcodeScanner({ onDetected, onManual, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingRef = useRef<BrowserMultiFormatReader | null>(null);
  const intervalRef = useRef<number | null>(null);
  const cooldownRef = useRef(false);
  const pausedRef = useRef(paused);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  pausedRef.current = paused;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const stopStream = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    zxingRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleDetected = useCallback((code: string) => {
    if (cooldownRef.current || pausedRef.current) return;
    cooldownRef.current = true;
    playScanBeep();
    onDetectedRef.current(code);
    // Jeda 1,5 detik sebelum scan lagi (anti double-scan).
    window.setTimeout(() => {
      cooldownRef.current = false;
    }, 1500);
  }, []);

  const startWithBarcodeDetector = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video || !window.BarcodeDetector) return false;
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = ['ean_13', 'code_128'].filter((f) => supported.includes(f));
      if (formats.length === 0) return false;
      const detector = new window.BarcodeDetector({ formats });
      video.srcObject = stream;
      await video.play();
      // Scan tiap 250ms, bukan tiap frame: cukup cepat untuk tangan
      // manusia, jauh lebih ringan untuk CPU.
      intervalRef.current = window.setInterval(async () => {
        if (pausedRef.current || cooldownRef.current) return;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
        try {
          const results = await detector.detect(video);
          if (results.length > 0 && results[0].rawValue) {
            handleDetected(results[0].rawValue);
          }
        } catch {
          // Frame gagal diproses (blur sesaat): lewati, coba lagi 250ms lagi.
        }
      }, 250);
      return true;
    } catch {
      return false;
    }
  }, [handleDetected]);

  const startWithZXing = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return false;
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.CODE_128]);
      hints.set(DecodeHintType.TRY_HARDER, false);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 250,
        delayBetweenScanSuccess: 1500,
      });
      zxingRef.current = reader;
      video.srcObject = stream;
      await video.play();
      // ZXing punya loop sendiri; callback dibatasi cooldown 1,5 detik.
      reader.decodeFromVideoElement(video, (result) => {
        if (result) handleDetected(result.getText());
      });
      return true;
    } catch {
      return false;
    }
  }, [handleDetected]);

  const startCamera = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment',
        },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchSupported(Boolean(caps?.torch));

      const nativeOk = await startWithBarcodeDetector(stream);
      if (!nativeOk) {
        const zxingOk = await startWithZXing(stream);
        if (!zxingOk) {
          throw new Error('Pemindai tidak bisa jalan di browser ini.');
        }
      }
      setStarting(false);
    } catch (e) {
      stopStream();
      setStarting(false);
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        setError('Kamera belum diizinkan. Ketuk ikon gembok di address bar, izinkan kamera, lalu coba lagi. Atau pakai Cari Manual di bawah.');
      } else if (e instanceof DOMException && e.name === 'NotFoundError') {
        setError('Tidak ada kamera yang ditemukan di perangkat ini. Pakai Cari Manual di bawah.');
      } else {
        setError('Kamera tidak bisa dibuka. Pakai Cari Manual di bawah.');
      }
    }
  }, [startWithBarcodeDetector, startWithZXing, stopStream]);

  useEffect(() => {
    void startCamera();
    return stopStream;
  }, [startCamera, stopStream]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch {
      // Perangkat tidak mendukung senter meski capability bilang iya.
    }
  }, [torchOn]);

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-ink shadow-card">
      <div className="relative aspect-[4/3] w-full bg-black">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-lg font-semibold leading-relaxed text-white">{error}</p>
            <BigButton tone="secondary" onClick={() => void startCamera()}>
              Coba Buka Kamera Lagi
            </BigButton>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              aria-label="Kamera pemindai barcode"
            />
            {starting ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <p className="text-lg font-semibold text-white">Membuka kamera...</p>
              </div>
            ) : (
              <>
                {/* Gelap di luar kotak, terang di dalam: mata langsung ke tengah.
                    Trik box-shadow: bayangan menyebar ke luar kotak saja,
                    jadi area di dalam kotak tetap terang. */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className="absolute left-1/2 top-1/2 h-[160px] w-[280px] max-w-[80%] -translate-x-1/2 -translate-y-1/2 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
                </div>
                {/* Sudut viewfinder tebal, warna primary. */}
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[160px] w-[280px] max-w-[80%] -translate-x-1/2 -translate-y-1/2">
                  <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-lg border-l-4 border-t-4 border-primary" />
                  <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-lg border-r-4 border-t-4 border-primary" />
                  <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-lg border-b-4 border-l-4 border-primary" />
                  <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-lg border-b-4 border-r-4 border-primary" />
                  <span className="scan-line absolute left-2 right-2 top-1/2 h-0.5 bg-primary" />
                </div>
                <p className="absolute inset-x-0 bottom-4 text-center text-base font-bold text-white drop-shadow">
                  Arahkan barcode ke dalam kotak
                </p>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-surface p-4">
        <BigButton tone="secondary" onClick={onManual} className="flex-1">
          Cari Manual
        </BigButton>
        {torchSupported && !error ? (
          <BigButton tone="secondary" onClick={toggleTorch} aria-pressed={torchOn}>
            {torchOn ? 'Matikan Senter' : 'Nyalakan Senter'}
          </BigButton>
        ) : null}
      </div>
    </div>
  );
}
