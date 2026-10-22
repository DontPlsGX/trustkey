import "./globals.css";
import { Be_Vietnam_Pro } from "next/font/google";
import { Providers } from "./providers";

// One grotesk, drawn for Vietnamese diacritics, so the elder's contact names render in the same face.
const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = {
  title: "Cùng Duyệt (FamilyKey)",
  description: "Send money with your family behind you: AI watches for scams, and risky transfers need the family to approve. Powered by Tide.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
