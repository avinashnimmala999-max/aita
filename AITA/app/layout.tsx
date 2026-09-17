import type { Metadata } from "next";
import Workspace from "../components/workspace";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pragati | JEE Prep Intelligence",
  description:
    "Turn every mistake into a better next step. A focused workspace for JEE students, teachers, and academic leaders.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Workspace />
        {children}
      </body>
    </html>
  );
}
