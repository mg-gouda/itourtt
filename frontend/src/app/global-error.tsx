"use client";

// Root-layout crashes: Next renders this instead of the whole document.
import "./globals.css";
import { ErrorScreen } from "@/components/error-screen";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <ErrorScreen error={error} />
      </body>
    </html>
  );
}
