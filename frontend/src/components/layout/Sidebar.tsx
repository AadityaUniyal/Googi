'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { 
  LayoutDashboard, 
  FileText, 
  Eye, 
  Search, 
  BarChart3, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Globe
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Documents', path: '/documents', icon: FileText },
    { label: 'Review Queue', path: '/review', icon: Eye },
    { label: 'Search & RAG', path: '/search', icon: Search },
    { label: 'Web Crawler', path: '/crawl', icon: Globe },
    { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  ];

  return (
    <aside
      className={clsx(
        'relative z-20 flex flex-col justify-between border-r border-white/[0.04] bg-[#080808] transition-all duration-300 ease-in-out select-none shrink-0 h-screen',
        sidebarOpen ? 'w-64' : 'w-20'
      )}
    >
      <div className="flex flex-col gap-6 pt-6 px-4">
        {/* Brand / Logo */}
        <div className="flex items-center justify-between h-10 px-2">
          <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-tr from-primary to-accent text-white shadow-md shadow-primary/20 shrink-0">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-sm font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-neutral-100 to-neutral-300 font-sans"
              >
                DocIntel AI
              </motion.span>
            )}
          </Link>
          
          {sidebarOpen && (
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.05] hover:border-white/[0.08] text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1 mt-4">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.path);
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                href={item.path}
                className={clsx(
                  'group flex items-center gap-3 py-2.5 px-3.5 rounded-xl text-sm font-medium transition-all duration-300 border border-transparent cursor-pointer',
                  isActive
                    ? 'bg-primary/10 text-primary border-primary/20 shadow-sm shadow-primary/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.02] hover:border-white/[0.04]'
                )}
              >
                <Icon className={clsx('h-4.5 w-4.5 shrink-0 transition-transform duration-300 group-hover:scale-105', isActive ? 'text-primary' : 'text-muted-foreground')} />
                
                {sidebarOpen ? (
                  <motion.span
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="font-sans"
                  >
                    {item.label}
                  </motion.span>
                ) : null}

                {isActive && (
                  <motion.div
                    layoutId="active-indicator"
                    className="absolute left-0 w-1 h-5 rounded-r bg-primary"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Toggle Open Sidebar (Minimized mode) */}
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-8 p-1 rounded-full border border-white/[0.06] bg-[#0c0c0c] text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200 z-30"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      )}

      {/* User Info / Profile & Logout */}
      <div className="flex flex-col border-t border-white/[0.04] p-4 gap-4 bg-[#0a0a0a]/50">
        {user && (
          <div className="flex items-center gap-3 overflow-hidden px-1">
            <div className="h-9 w-9 rounded-xl bg-neutral-900 border border-white/[0.06] flex items-center justify-center text-sm font-bold text-primary font-mono shrink-0">
              {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col min-w-0"
              >
                <span className="text-xs font-semibold text-neutral-200 truncate font-sans">
                  {user.full_name}
                </span>
                <span className="text-[10px] font-bold font-mono text-muted-foreground uppercase mt-0.5 tracking-wider">
                  {user.role}
                </span>
              </motion.div>
            )}
          </div>
        )}

        <button
          onClick={logout}
          className={clsx(
            'group flex items-center gap-3 py-2 px-3 rounded-lg text-xs font-semibold border border-transparent text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 cursor-pointer transition-all duration-300 w-full',
            !sidebarOpen && 'justify-center'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
          {sidebarOpen && <span className="font-sans">Log Out</span>}
        </button>
      </div>
    </aside>
  );
};
export default Sidebar;
