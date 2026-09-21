import ToastProvider from "@/components/ToastProvider"
import { Providers } from "./providers"
import "./globals.css"
import { THEME_BOOTSTRAP } from "@/lib/theme"
import AppShell from "@/components/shell/AppShell"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

export const metadata = {
  title: {
    default: "Matrubhoomi Farms & Developers – Workforce System",
    template: "%s | Matrubhoomi",
  },
  description:
    "The internal workforce system for Matrubhoomi Farms & Developers Private Limited — employee records, attendance, payroll, leave and documents in one place.",

  keywords: [
    "Matrubhoomi Farms",
    "Matrubhoomi Developers",
    "HRMS",
    "Attendance Management",
    "Payroll",
    "Employee Portal",
  ],

  openGraph: {
    title: "Matrubhoomi Farms & Developers – Workforce System",
    description:
      "Employee records, attendance, payroll, leave and documents for Matrubhoomi Farms & Developers Private Limited.",
    url: SITE_URL,
    siteName: "Matrubhoomi Farms & Developers",
    locale: "en_IN",
    type: "website",
  },

  robots: {
    // An internal tool. Nothing here belongs in a search index, including the
    // landing page — it names staff-facing routes and the company's structure.
    index: false,
    follow: false,
  },

  icons: {
    // The company emblem, pre-rendered at each size it is asked for.
    //
    // A browser handed one 512px PNG for a 16px favicon slot downloads 384KB to
    // draw 256 pixels, and scales it with a box filter that turns the brickwork
    // into mud. These are resized from the master with a proper filter at build
    // time — see the generator alongside public/matrubhoomi-logo-master.png.
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/matrubhoomi-logo-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },

  metadataBase: new URL(SITE_URL),
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Sets data-mb-theme on <html> before first paint, so a dark-theme
            user never sees a light flash and the portal can still be server
            rendered. In the root layout rather than in the portal, so it has
            already run whichever route the visitor lands on first. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <Providers>
          <ToastProvider>
            {/* The rail is mounted HERE, above everything that swaps, so a
                department change replaces only the content beside it. Inside a
                dashboard layout it unmounted on every navigation, which is what
                forced a full page load. */}
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  )
}
