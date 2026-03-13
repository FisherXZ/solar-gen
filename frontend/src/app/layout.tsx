import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import { SidebarProvider } from "@/components/SidebarContext";
import { ApiKeyProvider } from "@/lib/api-key";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "sonner";
import * as Tooltip from "@radix-ui/react-tooltip";
import Sidebar from "@/components/Sidebar";
import MainContent from "@/components/MainContent";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Solar Lead Gen",
  description:
    "Discover utility-scale solar projects from ISO interconnection queues",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} font-sans antialiased`}
      >
        <AuthProvider>
          <ApiKeyProvider>
            <Tooltip.Provider delayDuration={300}>
              <SidebarProvider>
                <Sidebar />
                <MainContent>{children}</MainContent>
              </SidebarProvider>
            </Tooltip.Provider>
          </ApiKeyProvider>
        </AuthProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#252320",
              border: "1px solid rgba(255, 248, 235, 0.08)",
              color: "#FFF8EB",
              fontFamily: "var(--font-geist-sans)",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
