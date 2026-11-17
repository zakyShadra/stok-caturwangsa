/** @type {import('tailwindcss').Config} */
// Token warna dari DESIGN.md (situs resmi perusahaan).
// Radius (skill 02, token discipline): 6px kontrol, 12px kartu, 999px badge.
// Shadow (skill 06, layered shadows): 3 step elevasi, tint ke primary-deep,
// satu sumber cahaya (ke bawah). Jangan shadow acak per komponen.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#00B9BE",
          deep: "#0F6F72",
          soft: "#B2EBEC",
        },
        canvas: "#E8FAF7",
        surface: {
          DEFAULT: "#FFFFFF",
          soft: "#F6FDFC",
        },
        hairline: "#D6EDEA",
        ink: {
          DEFAULT: "#2F3B45",
          muted: "#5A6B76",
          subtle: "#8A9BA5",
        },
        success: "#1E9E6A",
        warning: "#D97706",
        info: "#0E7FA8",
        error: "#DC2626",
        // Teks badge: turunan gelap dari warna status yang sama (bukan hue baru),
        // supaya kontras 4.5:1 di atas tint 12% (skill 15).
        "success-ink": "#14663F",
        "warning-ink": "#92400E",
        "info-ink": "#0A5E7D",
      },
      fontFamily: {
        sans: ["Quicksand", "system-ui", "sans-serif"],
      },
      borderRadius: {
        control: "8px",
        button: "12px",
        card: "16px",
      },
      boxShadow: {
        // rest: lapisan ketat (tepi kontak) + lapisan pudar (falloff)
        card: "0 1px 2px rgba(15, 111, 114, 0.10), 0 2px 8px rgba(15, 111, 114, 0.05)",
        // hover: satu lapisan falloff tambahan, tetap halus
        "card-hover": "0 1px 2px rgba(15, 111, 114, 0.10), 0 4px 12px rgba(15, 111, 114, 0.08), 0 12px 28px rgba(15, 111, 114, 0.06)",
        // lifted: hanya untuk kartu hero (satu per halaman)
        lift: "0 1px 2px rgba(15, 111, 114, 0.12), 0 8px 20px rgba(15, 111, 114, 0.10), 0 20px 44px rgba(15, 111, 114, 0.08)",
      },
    },
  },
  plugins: [],
}
