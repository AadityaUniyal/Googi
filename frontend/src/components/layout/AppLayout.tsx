'use client';

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth';
import { AuthPage } from '@/components/auth/AuthPage';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { Loader2 } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user, loadUser, isLoading } = useAuthStore();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      if (token && !user) {
        try {
          await loadUser();
        } catch {
          // Handled in loadUser (calls logout)
        }
      }
      setAuthChecked(true);
    };
    checkAuth();
  }, [token, user, loadUser]);

  if (!authChecked || (token && !user && isLoading)) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center h-screen w-screen bg-[#080808]">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <span className="text-sm font-semibold tracking-wider text-muted-foreground font-mono">
          Authenticating session...
        </span>
      </div>
    );
  }

  // Auth Gate
  if (!token || !user) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthPage />
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#111111',
              color: '#F5F5F5',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              fontFamily: 'var(--font-sans), sans-serif',
            },
          }}
        />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-screen bg-[#080808] overflow-hidden text-[#F5F5F5]">
        <Sidebar />
        
        <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto relative bg-[#080808] p-8">
          {children}
        </main>

        <CommandPalette />
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#111111',
              color: '#F5F5F5',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              fontFamily: 'var(--font-sans), sans-serif',
              fontSize: '13px',
              fontWeight: 500,
            },
          }}
        />
      </div>
    </QueryClientProvider>
  );
};
export default AppLayout;
