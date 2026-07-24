import React, { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useLocation } from 'wouter';
import { getCurrentMerchant } from '@/lib/store';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const merchant = getCurrentMerchant();
    if (!merchant || merchant.status !== 'approved') {
      setLocation('/login');
    }
  }, [setLocation]);

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
