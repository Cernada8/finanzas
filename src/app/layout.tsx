import type { Metadata } from "next";
import "./globals.css";
import { NavShell } from "@/components/nav-shell";

export const metadata: Metadata = {
  title: "Finance Dashboard",
  description: "Private spending and investment dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}
