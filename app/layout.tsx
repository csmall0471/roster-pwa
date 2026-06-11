import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Anton,
  Bebas_Neue,
  Archivo_Black,
  Oswald,
  Black_Ops_One,
  Bungee,
  Permanent_Marker,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import PullToRefresh from "./_components/PullToRefresh";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
});

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  weight: "400",
  subsets: ["latin"],
});

const oswald = Oswald({
  variable: "--font-oswald",
  weight: "700",
  subsets: ["latin"],
});

const blackOps = Black_Ops_One({
  variable: "--font-black-ops",
  weight: "400",
  subsets: ["latin"],
});

const bungee = Bungee({
  variable: "--font-bungee",
  weight: "400",
  subsets: ["latin"],
});

const marker = Permanent_Marker({
  variable: "--font-marker",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Coach Connor's Player Manager",
  description: "Youth sports team roster management",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Player Manager",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} ${bebas.variable} ${archivoBlack.variable} ${oswald.variable} ${blackOps.variable} ${bungee.variable} ${marker.variable} h-full antialiased`}
    >
      <head>
        {/* Apply the saved theme (or OS preference) before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <PullToRefresh />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
