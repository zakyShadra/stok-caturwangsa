// Foto: baca file jadi data URL, diperkecil dulu kalau gambar.
// Dipakai selfie absen (CheckInFlow) dan bukti kerja foto
// (halaman Absensi). Foto kamera HP asli bisa beberapa MB; tanpa
// diperkecil, satu foto bisa memenuhi penyimpanan. Diperkecil di
// canvas (sisi terpanjang maks 640px, JPEG kualitas 0.82) supaya
// ukurannya tinggal puluhan KB sebelum di-upload ke server.
// Dokumen (bukan gambar) dibaca apa adanya, tanpa diubah.
export function fileToDataUrl(file: File): Promise<string> {
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
