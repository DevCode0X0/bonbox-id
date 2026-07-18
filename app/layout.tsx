import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://bonbox.id"),
  title: { default: "BONBOX — Make Life Easy", template: "%s | BONBOX" },
  description: "Katalog home living pilihan BONBOX dengan checkout langsung di Shopee.",
  openGraph: {
    title: "BONBOX — Rumah lebih rapi. Hidup lebih mudah.",
    description: "Temukan produk home living pilihan dan lanjutkan pembelian dengan aman di Shopee.",
    url: "https://bonbox.id",
    siteName: "BONBOX",
    locale: "id_ID",
    type: "website",
    images: [{
      url: "/og-whatsapp.jpg?v=20260718",
      width: 1200,
      height: 630,
      type: "image/jpeg",
      alt: "BONBOX — Rumah lebih rapi. Hidup lebih mudah.",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BONBOX — Rumah lebih rapi. Hidup lebih mudah.",
    description: "Temukan produk home living pilihan dan lanjutkan pembelian dengan aman di Shopee.",
    images: ["/og-whatsapp.jpg?v=20260718"],
  },
  icons: {
    icon: "/bonbox-icon.png",
    shortcut: "/bonbox-icon.png",
    apple: "/bonbox-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
