import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TenantTheme } from "@/components/tenant-theme";
import { getTenantConfig } from "@/lib/tenants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Génération dynamique des métadonnées selon le tenant
export async function generateMetadata(): Promise<Metadata> {
  const tenant = getTenantConfig();

  return {
    title: tenant.metadata.title,
    description: tenant.metadata.description,
    icons: {
      icon: [
        { url: tenant.branding.logo, type: 'image/png' },
        { url: tenant.branding.favicon, sizes: 'any' }
      ],
      apple: [
        { url: tenant.branding.appleIcon, type: 'image/png', sizes: '180x180' }
      ],
    },
    openGraph: {
      title: tenant.metadata.title,
      description: tenant.metadata.description,
      images: [{ url: tenant.branding.ogImage, width: 1200, height: 630, alt: tenant.name }],
      siteName: tenant.name,
      type: 'website',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: tenant.name,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <TenantTheme />
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
