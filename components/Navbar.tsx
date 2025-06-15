"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUser } from '@/components/useUser';
import { useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, businessName, role, vendor, loading } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push("/");
  };

  const adminLinks = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Vendors", href: "/vendors" },
    { name: "Subscription Plans", href: "/subscriptions" },
    { name: "Products / Stock", href: "/products" },
  ];
  const vendorLinks = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Stocks", href: "/stocks" },
    { name: "Audit", href: "/audit" },
  ];
  const navLinks = role === 'vendor' ? vendorLinks : adminLinks;

  return (
    <nav className="sticky top-0 z-30 w-full bg-white border-b border-neutral-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center min-w-[120px]">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl text-primary-700">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 font-bold text-lg">M</span>
            <span className="hidden sm:inline">Moosa</span>
          </Link>
        </div>
        {/* Hamburger for mobile */}
        <div className="flex sm:hidden">
          <button onClick={() => setMobileMenuOpen(v => !v)} className="inline-flex items-center justify-center p-2 rounded-md text-primary-700 hover:bg-primary-50 focus:outline-none">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
        {/* Center: Nav Links */}
        <div className="hidden sm:flex flex-1 justify-center">
          <div className="flex gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "relative px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "text-primary-900 font-semibold"
                    : "text-neutral-700 hover:text-primary-700 hover:bg-primary-50"
                )}
              >
                {link.name}
                {pathname === link.href && (
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-8 h-0.5 bg-primary-700 rounded-full" />
                )}
              </Link>
            ))}
          </div>
        </div>
        {/* Right: User Info & Sign Out */}
        <div className="hidden sm:flex items-center gap-4 min-w-[180px] justify-end pr-2 lg:pr-0" style={{marginRight: '-8px'}}>
          {role === 'vendor' && businessName && (
            <div className="text-right mr-2">
              <div className="font-bold text-primary-700">{businessName}</div>
              <div className="text-xs text-neutral-500">{vendor?.vendorCode}</div>
            </div>
          )}
          {role === 'admin' && user && (
            <div className="text-right mr-2">
              <div className="font-medium text-neutral-900">{user.email?.split('@')[0]}</div>
              <div className="text-xs text-neutral-500">Super Admin</div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-md text-sm font-medium border border-neutral-200 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden fixed left-1/2 top-16 z-40 -translate-x-1/2 w-full max-w-xs px-2 animate-fadeIn">
          {/* Arrow */}
          <div className="w-6 h-6 absolute -top-3 left-1/2 -translate-x-1/2">
            <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,0 24,24 0,24" fill="#fff" className="drop-shadow-md"/></svg>
          </div>
          <div className="bg-white rounded-2xl shadow-2xl border border-neutral-100 p-4 flex flex-col gap-2 relative">
            <div className="flex flex-col gap-2 mb-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    "relative px-4 py-2 rounded-md text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "text-primary-900 font-semibold bg-primary-50"
                      : "text-neutral-700 hover:text-primary-700 hover:bg-primary-50"
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.name}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-neutral-100 pt-2">
              {role === 'vendor' && businessName && (
                <div className="text-left">
                  <div className="font-bold text-primary-700">{businessName}</div>
                  <div className="text-xs text-neutral-500">{vendor?.vendorCode}</div>
                </div>
              )}
              {role === 'admin' && user && (
                <div className="text-left">
                  <div className="font-medium text-neutral-900">{user.email?.split('@')[0]}</div>
                  <div className="text-xs text-neutral-500">Super Admin</div>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-md text-sm font-medium border border-neutral-200 transition-colors text-left"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
} 