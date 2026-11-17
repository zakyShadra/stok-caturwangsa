// Umpan balik scan berhasil: bunyi beep + getar singkat.
// Staf gudang tidak harus menatap layar untuk tahu scan berhasil.
let audioCtx: AudioContext | null = null;

export function playScanBeep(): void {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
    // Audio gagal (misal browser blokir): abaikan, getar saja cukup.
  }
  try {
    navigator.vibrate?.(50);
  } catch {
    // Bukan HP atau tidak didukung: abaikan.
  }
}
