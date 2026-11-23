import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Nutrikal Translate" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bg">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <a className="brand" href="/">
              Nutrikal Translate
            </a>
            <a href="/">Магазини</a>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
