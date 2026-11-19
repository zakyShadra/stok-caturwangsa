// Alur absen dengan verifikasi: langkah 1 cek lokasi GPS, langkah 2
// foto selfie. Dipakai untuk Absen Masuk dan Absen Pulang.
// - Lokasi: browser membaca GPS HP, jarak ke kantor dihitung dengan
//   rumus Haversine. Di luar radius 200 meter, absen ditolak, tanpa
//   jalan pintas.
// - Selfie: input file dengan capture="user" membuka kamera depan
//   langsung di HP. Foto dicek dulu di preview sebelum dikonfirmasi.
//   Foto diperkecil dulu (maks 640px, JPEG 0.82) sebelum di-upload
//   ke server, supaya tidak memenuhi database. Kalau penyimpanan
//   gagal (misal internet putus), pesan error tampil di langkah
//   preview dan pengguna bisa mengetuk lagi tanpa foto ulang.
// Ditampilkan sebagai overlay layar penuh (portal ke body), karena
// wrapper halaman punya transform animasi yang merusak position:fixed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BigButton } from './ui';
import { fileToDataUrl } from '../lib/photo';
import { useAttendanceState } from '../lib/attendance-state';
import {
  GEOFENCE_RADIUS_METERS,
  OFFICE_LOCATION,
  POOR_ACCURACY_METERS,
  haversineDistanceMeters,
  jakartaTime,
} from '../lib/attendance';
import type { CheckVerification } from '../lib/attendance';

type Step =
  | { kind: 'locating' }
  | { kind: 'outside'; distanceMeters: number }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'selfie'; lat: number; lon: number; distanceMeters: number; accuracyMeters: number }
  | { kind: 'preview'; lat: number; lon: number; distanceMeters: number; accuracyMeters: number; url: string; name: string };

interface Props {
  type: 'masuk' | 'pulang';
  onComplete: (v: CheckVerification) => Promise<boolean>;
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

export default function CheckInFlow({ type, onComplete, onCancel }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'locating' });
  const [saving, setSaving] = useState(false);
  // Error penyimpanan pakai state lokal: error global bisa berisi
  // error lama dari operasi lain yang tidak terkait.
  const [saveFailed, setSaveFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const title = type === 'masuk' ? 'Absen Masuk' : 'Absen Pulang';
  const { clearError } = useAttendanceState();

  // Bersihkan error global saat alur dibuka, supaya error lama
  // tidak ikut tampil di belakang alur ini.
  useEffect(() => {
    clearError();
  }, [clearError]);

  const checkLocation = useCallback(() => {
    setStep({ kind: 'locating' });
    getPosition()
      .then((pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const distance = Math.round(
          haversineDistanceMeters(latitude, longitude, OFFICE_LOCATION.lat, OFFICE_LOCATION.lon),
        );
        // Akurasi jelek (laptop tanpa GPS, posisi dari IP/WiFi):
        // jaraknya tidak bisa dipercaya, jadi absen tetap lanjut ke
        // selfie dan server menandainya untuk keputusan Bos.
        if (distance <= GEOFENCE_RADIUS_METERS || accuracy > POOR_ACCURACY_METERS) {
          setStep({ kind: 'selfie', lat: latitude, lon: longitude, distanceMeters: distance, accuracyMeters: Math.round(accuracy) });
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
    const { lat, lon, distanceMeters, accuracyMeters } = step;
    // Foto dibaca dulu jadi data URL, baru pindah ke preview. Selama
    // membaca, tetap di langkah selfie (prosesnya sepersekian detik).
    void fileToDataUrl(file).then((url) => {
      if (!url) return;
      setStep({
        kind: 'preview',
        lat,
        lon,
        distanceMeters,
        accuracyMeters,
        url,
        name: file.name,
      });
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRetake = () => {
    if (step.kind !== 'preview') return;
    setStep({ kind: 'selfie', lat: step.lat, lon: step.lon, distanceMeters: step.distanceMeters, accuracyMeters: step.accuracyMeters });
  };

  const handleConfirm = async () => {
    if (step.kind !== 'preview' || saving) return;
    setSaving(true);
    setSaveFailed(false);
    const ok = await onComplete({
      lat: step.lat,
      lon: step.lon,
      distanceMeters: step.distanceMeters,
      accuracyMeters: step.accuracyMeters,
      selfieUrl: step.url,
      selfieName: step.name,
      time: jakartaTime(),
    });
    setSaving(false);
    if (!ok) setSaveFailed(true);
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
            {step.accuracyMeters > POOR_ACCURACY_METERS ? (
              <p className="rounded-button bg-warning/10 px-4 py-3 text-center text-lg font-bold text-warning-ink">
                Lokasi tidak akurat (kurang lebih {step.accuracyMeters.toLocaleString('id-ID')} meter).
                Absen tetap dicatat, Bos yang memutuskan.
              </p>
            ) : (
              <p className="rounded-button bg-success/10 px-4 py-3 text-center text-lg font-bold text-success-ink">
                Anda di area pabrik ({step.distanceMeters} meter dari kantor).
              </p>
            )}
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
            {saveFailed ? (
              <p className="mt-4 rounded-button bg-error/10 px-4 py-3 text-center text-base font-bold text-error">
                Gagal menyimpan absen. Periksa koneksi internet, lalu ketuk lagi.
              </p>
            ) : null}
            <div className="mt-6 space-y-3">
              <BigButton tone="primary" full onClick={handleConfirm} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Ini Foto Saya'}
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
