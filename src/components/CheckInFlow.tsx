// Alur absen dengan verifikasi: langkah 1 cek lokasi GPS, langkah 2
// foto selfie. Dipakai untuk Absen Masuk dan Absen Pulang.
// - Lokasi: browser membaca GPS HP, jarak ke kantor dihitung dengan
//   rumus Haversine. Di luar radius 200 meter, absen ditolak, tanpa
//   jalan pintas.
// - Selfie: input file dengan capture="user" membuka kamera depan
//   langsung di HP. Foto dicek dulu di preview sebelum dikonfirmasi.
//   Foto disimpan sebagai data URL JPEG yang diperkecil (maks 640px),
//   BUKAN object URL: object URL mati begitu halaman di-refresh, dan
//   cleanup unmount dulu sempat mencabut URL yang baru disimpan,
//   sehingga foto selfie tampil rusak di halaman Absensi.
// Ditampilkan sebagai overlay layar penuh (portal ke body), karena
// wrapper halaman punya transform animasi yang merusak position:fixed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BigButton } from './ui';
import {
  GEOFENCE_RADIUS_METERS,
  OFFICE_LOCATION,
  haversineDistanceMeters,
  jakartaTime,
} from '../lib/attendance';
import type { CheckVerification } from '../lib/attendance';

type Step =
  | { kind: 'locating' }
  | { kind: 'outside'; distanceMeters: number }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'selfie'; lat: number; lon: number; distanceMeters: number }
  | { kind: 'preview'; lat: number; lon: number; distanceMeters: number; url: string; name: string };

interface Props {
  type: 'masuk' | 'pulang';
  onComplete: (v: CheckVerification) => void;
  onCancel: () => void;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

// Ubah file foto jadi data URL JPEG yang diperkecil (sisi terpanjang
// maks 640px, kualitas 0.82), supaya muat disimpan di localStorage.
// Foto kamera HP asli bisa beberapa MB; tanpa diperkecil, localStorage
// (kuota sekitar 5 MB) bisa penuh hanya oleh satu foto. Kalau gambar
// gagal dibaca atau digambar, fallback ke data URL asli dari FileReader.
function fileToDataUrl(file: File): Promise<string> {
  const readRaw = () =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  if (!file.type.startsWith('image/')) return readRaw();
  return new Promise((resolve) => {
    const tempUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(tempUrl);
      const MAX = 640;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        void readRaw().then(resolve);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      void readRaw().then(resolve);
    };
    img.src = tempUrl;
  });
}

export default function CheckInFlow({ type, onComplete, onCancel }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'locating' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const title = type === 'masuk' ? 'Absen Masuk' : 'Absen Pulang';

  const checkLocation = useCallback(() => {
    setStep({ kind: 'locating' });
    getPosition()
      .then((pos) => {
        const { latitude, longitude } = pos.coords;
        const distance = Math.round(
          haversineDistanceMeters(latitude, longitude, OFFICE_LOCATION.lat, OFFICE_LOCATION.lon),
        );
        if (distance <= GEOFENCE_RADIUS_METERS) {
          setStep({ kind: 'selfie', lat: latitude, lon: longitude, distanceMeters: distance });
        } else {
          setStep({ kind: 'outside', distanceMeters: distance });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === 'unsupported') {
          setStep({ kind: 'unavailable' });
          return;
        }
        const code = (err as GeolocationPositionError | null)?.code;
        if (code === 1) {
          setStep({ kind: 'denied' });
        } else {
          setStep({ kind: 'unavailable' });
        }
      });
  }, []);

  useEffect(() => {
    checkLocation();
  }, [checkLocation]);

  const handleFile = (files: FileList | null) => {
    if (!files || files.length === 0 || step.kind !== 'selfie') return;
    const file = files[0];
    const { lat, lon, distanceMeters } = step;
    // Foto dibaca dulu jadi data URL, baru pindah ke preview. Selama
    // membaca, tetap di langkah selfie (prosesnya sepersekian detik).
    void fileToDataUrl(file).then((url) => {
      if (!url) return;
      setStep({
        kind: 'preview',
        lat,
        lon,
        distanceMeters,
        url,
        name: file.name,
      });
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRetake = () => {
    if (step.kind !== 'preview') return;
    setStep({ kind: 'selfie', lat: step.lat, lon: step.lon, distanceMeters: step.distanceMeters });
  };

  const handleConfirm = () => {
    if (step.kind !== 'preview') return;
    onComplete({
      lat: step.lat,
      lon: step.lon,
      distanceMeters: step.distanceMeters,
      selfieUrl: step.url,
      selfieName: step.name,
      time: jakartaTime(),
    });
  };

  const stepLabel =
    step.kind === 'selfie' || step.kind === 'preview'
      ? 'Langkah 2 dari 2: Foto selfie'
      : 'Langkah 1 dari 2: Cek lokasi';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-label={title}>
      <div className="entrance max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-card bg-surface p-6 shadow-lift sm:rounded-card">
        <h2 className="text-2xl font-bold text-ink">{title}</h2>
        <p className="mt-1 text-base font-semibold text-primary-deep">{stepLabel}</p>

        {step.kind === 'locating' ? (
          <div className="py-10 text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary-soft border-t-primary" />
            <p className="mt-5 text-lg font-bold text-ink">Mencari lokasi Anda...</p>
            <p className="mt-2 text-base text-ink-muted">
              Pastikan GPS HP sudah menyala.
            </p>
          </div>
        ) : null}

        {step.kind === 'outside' ? (
          <div className="py-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-error/10">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
            </div>
            <p className="mt-5 text-xl font-bold text-ink">Anda di luar area pabrik.</p>
            <p className="mt-2 text-lg text-ink">
              Absen hanya bisa dilakukan di area pabrik. Jarak Anda dari
              kantor sekarang {step.distanceMeters.toLocaleString('id-ID')} meter.
            </p>
            <div className="mt-6 space-y-3">
              <BigButton tone="primary" full onClick={checkLocation}>
                Coba Lagi
              </BigButton>
              <BigButton tone="secondary" full onClick={onCancel}>
                Batal
              </BigButton>
            </div>
          </div>
        ) : null}

        {step.kind === 'denied' ? (
          <div className="py-6 text-center">
            <p className="text-xl font-bold text-ink">Izin lokasi belum diberikan.</p>
            <p className="mt-2 text-lg text-ink">
              Aplikasi butuh lokasi Anda untuk memastikan Anda ada di area
              pabrik. Ketuk ikon gembok di address bar, izinkan lokasi,
              lalu coba lagi.
            </p>
            <div className="mt-6 space-y-3">
              <BigButton tone="primary" full onClick={checkLocation}>
                Coba Lagi
              </BigButton>
              <BigButton tone="secondary" full onClick={onCancel}>
                Batal
              </BigButton>
            </div>
          </div>
        ) : null}

        {step.kind === 'unavailable' ? (
          <div className="py-6 text-center">
            <p className="text-xl font-bold text-ink">Lokasi tidak bisa dibaca.</p>
            <p className="mt-2 text-lg text-ink">
              Pastikan GPS HP sudah menyala dan Anda ada di tempat terbuka,
              lalu coba lagi.
            </p>
            <div className="mt-6 space-y-3">
              <BigButton tone="primary" full onClick={checkLocation}>
                Coba Lagi
              </BigButton>
              <BigButton tone="secondary" full onClick={onCancel}>
                Batal
              </BigButton>
            </div>
          </div>
        ) : null}

        {step.kind === 'selfie' ? (
          <div className="py-4">
            <p className="rounded-button bg-success/10 px-4 py-3 text-center text-lg font-bold text-success-ink">
              Anda di area pabrik ({step.distanceMeters} meter dari kantor).
            </p>
            <p className="mt-5 text-center text-lg text-ink">
              Sekarang foto wajah Anda. Pastikan wajah terlihat jelas.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              aria-label="Ambil foto selfie"
              onChange={(e) => handleFile(e.target.files)}
            />
            <div className="mt-6 space-y-3">
              <BigButton tone="primary" full onClick={() => fileInputRef.current?.click()}>
                Ambil Foto Selfie
              </BigButton>
              <BigButton tone="secondary" full onClick={onCancel}>
                Batal
              </BigButton>
            </div>
          </div>
        ) : null}

        {step.kind === 'preview' ? (
          <div className="py-4">
            <img
              src={step.url}
              alt="Foto selfie Anda"
              className="mx-auto max-h-72 w-auto rounded-card border border-hairline object-contain"
            />
            <p className="mt-4 text-center text-lg text-ink">
              Apakah foto ini sudah benar?
            </p>
            <div className="mt-6 space-y-3">
              <BigButton tone="primary" full onClick={handleConfirm}>
                Ini Foto Saya
              </BigButton>
              <BigButton tone="secondary" full onClick={handleRetake}>
                Foto Ulang
              </BigButton>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
