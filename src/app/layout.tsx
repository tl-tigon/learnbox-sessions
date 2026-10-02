import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'LearnBox Sessions',
  description: 'Live polls, Q&A, quizzes and surveys for any audience.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        {/* A theme chosen on this device is applied before the page paints; with none chosen, the device's own setting decides. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('la-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}" }} />
        {children}
      </body>
    </html>
  );
}
