import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/dm-sans";
import "./globals.css";

export const metadata = {
  title: "FLOW · CAT 2026 planner",
  description: "A flexible day-by-day study planner for CAT preparation. Every block, break and target is editable.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F4F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1320" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
