import type { Metadata } from 'next';
import { Geologica, Onest } from 'next/font/google';
import './globals.css';
import LocaleSync from '@/components/LocaleSync';

const onest = Onest({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-onest',
  display: 'swap',
  adjustFontFallback: false,
});

const geologica = Geologica({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-geologica',
  display: 'swap',
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: 'Shanyraq (Шаңырақ) — Панель управления ОСИ и УК',
  description: 'Единая платформа управления жилыми комплексами и собраниями собственников в Казахстане',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${onest.variable} ${geologica.variable}`}>
      <body>
        <LocaleSync />
        {children}
      </body>
    </html>
  );
}
