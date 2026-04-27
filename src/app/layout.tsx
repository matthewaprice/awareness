import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NavBar } from "@/components/nav-bar";

export const metadata: Metadata = {
  title: "IIH Information",
  description:
    "Connecting patients and physicians around rare disease awareness, research, and support.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-background focus:px-4 focus:py-2 focus:text-foreground"
          >
            Skip to main content
          </a>
          <NavBar />
          <div id="main-content" className="flex flex-1 flex-col">
            {children}
          </div>
          <footer className="border-t py-6 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} IIH Info. All rights reserved.</p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
