import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
const plusJakartaSans = Plus_Jakarta_Sans({
    variable: "--font-plus-jakarta-sans",
    subsets: ["latin"],
});
const ibmPlexMono = IBM_Plex_Mono({
    variable: "--font-ibm-plex-mono",
    subsets: ["latin"],
});
export const metadata = {
    title: "Epifi Notes",
    description: "A beautiful Keep-style notes workspace with login, sharing, and bin management.",
};
export default function RootLayout({ children, }) {
    return (<html lang="en" className={`${plusJakartaSans.variable} ${ibmPlexMono.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col bg-background text-foreground">
            {children}
        </body>
    </html>);
}
