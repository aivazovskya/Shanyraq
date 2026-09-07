import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
