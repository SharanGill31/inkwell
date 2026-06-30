import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Inkwell",
  description: "Local-first collaborative document editor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="mt-auto border-t border-border py-4 text-center text-sm text-muted-foreground">
          <span>Sharandeep Kaur</span>
          {" · "}
          <a
            href="https://github.com/SharanGill31"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            GitHub
          </a>
          {" · "}
          <a
            href="https://linkedin.com/in/sharan-gill-b07a57273"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            LinkedIn
          </a>
        </footer>
      </body>
    </html>
  );
}
