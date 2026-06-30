import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import "./globals.css";
import { ShellSwitcher } from "@/components/shared/ShellSwitcher";

const inter = Inter({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "V Solve Hub — One App, All Solutions",
  description: "Book home services, vehicle repair, events, and more at your doorstep.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`app-shell ${inter.className}`} suppressHydrationWarning>
        <ShellSwitcher>{children}</ShellSwitcher>
      </body>
    </html>
  );
}
