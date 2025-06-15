'use client';

import './globals.css';
import type { Metadata } from 'next';
import { UserProvider } from '@/components/UserContext';
import { useUser } from '@/components/useUser';
import VendorNavbar from '../components/VendorNavbar';
import Navbar from '../components/Navbar';
import { usePathname } from 'next/navigation';

function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, loading } = useUser();
  const pathname = usePathname();
  if (loading) return <div>Loading...</div>;
  return (
    <>
      {pathname !== '/' && (role === 'vendor' ? <VendorNavbar /> : <Navbar />)}
      {children}
    </>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          <AppLayout>{children}</AppLayout>
          <footer className="w-full flex items-center justify-center py-4 text-xs text-neutral-400 fixed bottom-0 left-0 z-20">
            © 2025 <a href="https://www.heytechmate.com" target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline font-medium mx-1">HeyTechMate</a>. All rights reserved.
          </footer>
        </UserProvider>
      </body>
    </html>
  );
} 