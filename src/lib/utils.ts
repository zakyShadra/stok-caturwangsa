import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Gabung nama kelas Tailwind (dipakai komponen grafik Bklit).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
