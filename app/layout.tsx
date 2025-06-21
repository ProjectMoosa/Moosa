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
  
  // Show footer only on dashboard and login pages
  const shouldShowFooter = pathname === '/' || pathname === '/dashboard';
  
  if (loading) return <div>Loading...</div>;
  return (
    <>
      {pathname !== '/' && (role === 'vendor' ? <VendorNavbar /> : <Navbar />)}
      {children}
      {shouldShowFooter && (
        <footer className="w-full flex items-center justify-center py-4 text-xs text-neutral-400">
          © 2025 <a href="https://www.heytechmate.com" target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline font-medium mx-1">HeyTechMate</a>. All rights reserved.
        </footer>
      )}
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
        </UserProvider>
      </body>
    </html>
  );
} 