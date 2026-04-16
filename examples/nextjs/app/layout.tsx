import type { ReactNode } from 'react';
import { PinflowProvider } from './pinflow-provider';

export const metadata = { title: 'Pinflow — Next.js Example' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', margin: 0 }}>
        <PinflowProvider />
        {children}
      </body>
    </html>
  );
}
