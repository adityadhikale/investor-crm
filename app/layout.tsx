import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
import { AppSidebar } from "@/components/app-sidebar";
import { TopNav } from "@/components/top-nav";
import { ToastProvider } from "@/components/toast-provider";
import { SidebarProvider } from "@/components/sidebar-provider";
import { MainContent } from "@/components/main-content";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const maharlika = localFont({
  src: "../public/fonts/Maharlika-Regular.ttf",
  variable: "--font-maharlika",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CREST CRM",
    template: "CREST CRM - %s",
  },
  description: "Internal CRM for managing investor contacts and follow-ups.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${maharlika.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col">
        <ToastProvider>
          <SidebarProvider>
            <TopNav />
            <div className="flex flex-1 overflow-hidden">
              <AppSidebar />
              <MainContent>{children}</MainContent>
            </div>
          </SidebarProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
