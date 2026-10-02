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
        {/* Every screen is light. Dark, chosen in the phone's menu, is applied to the phone's screens before they paint. The `js` class tells the site's pictures that scripts run, so they may wait to be scrolled to. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js');try{if(location.pathname==='/s'&&localStorage.getItem('la-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}" }} />
        {children}
      </body>
    </html>
  );
}
