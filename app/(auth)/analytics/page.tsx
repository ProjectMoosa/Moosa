"use client";

import { useUser } from '@/components/useUser';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function VendorAnalyticsPage() {
  const { role, loading } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (!loading && role !== 'vendor') {
      router.replace('/dashboard');
    }
  }, [role, loading, router]);
  if (loading || role !== 'vendor') return null;
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-primary-700 mb-4">Analytics</h1>
      <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-8 text-neutral-500 text-lg">
        Analytics and charts coming soon.
      </div>
    </div>
  );
} 