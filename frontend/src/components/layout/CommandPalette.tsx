'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { Command } from 'cmdk';
import { 
  LayoutDashboard, 
  FileText, 
  Eye, 
  Search, 
  BarChart3, 
  LogOut, 
  Sparkles,
  SearchIcon,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const CommandPalette: React.FC = () => {
  const router = useRouter();
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const { logout } = useAuthStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const navigateTo = (path: string) => {
    router.push(path);
    setCommandPaletteOpen(false);
  };

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCommandPaletteOpen(false)}
            className="fixed inset-0 z-50 bg-[#000]/60 backdrop-blur-md"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg p-1.5"
          >
            <div className="glass-card bg-[#0b0b0b]/95 border border-white/[0.08] shadow-2xl rounded-2xl overflow-hidden">
              <Command className="flex flex-col w-full">
                <div className="flex items-center gap-3 px-4 border-b border-white/[0.04] py-3.5">
                  <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Command.Input
                    autoFocus
                    placeholder="Search commands or navigate..."
                    className="w-full bg-transparent border-0 text-neutral-200 placeholder-neutral-500 text-sm focus:outline-none focus:ring-0"
                  />
                  <div className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.02] text-muted-foreground uppercase">
                    ESC
                  </div>
                </div>

                <Command.List className="max-h-[300px] overflow-y-auto p-2 scrollbar select-none">
                  <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                    No results found.
                  </Command.Empty>

                  <Command.Group heading="Navigation" className="text-[10px] font-bold tracking-wider text-muted-foreground/80 font-sans uppercase px-3.5 py-2">
                    <Command.Item
                      onSelect={() => navigateTo('/dashboard')}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm text-neutral-300 hover:text-foreground hover:bg-white/[0.03] cursor-pointer transition-all duration-150 aria-selected:bg-white/[0.03] aria-selected:text-foreground"
                    >
                      <div className="flex items-center gap-3">
                        <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                        <span>Go to Dashboard</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/45" />
                    </Command.Item>

                    <Command.Item
                      onSelect={() => navigateTo('/documents')}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm text-neutral-300 hover:text-foreground hover:bg-white/[0.03] cursor-pointer transition-all duration-150 aria-selected:bg-white/[0.03] aria-selected:text-foreground"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>Go to Documents list</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/45" />
                    </Command.Item>

                    <Command.Item
                      onSelect={() => navigateTo('/review')}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm text-neutral-300 hover:text-foreground hover:bg-white/[0.03] cursor-pointer transition-all duration-150 aria-selected:bg-white/[0.03] aria-selected:text-foreground"
                    >
                      <div className="flex items-center gap-3">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <span>Go to Review Queue</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/45" />
                    </Command.Item>

                    <Command.Item
                      onSelect={() => navigateTo('/search')}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm text-neutral-300 hover:text-foreground hover:bg-white/[0.03] cursor-pointer transition-all duration-150 aria-selected:bg-white/[0.03] aria-selected:text-foreground"
                    >
                      <div className="flex items-center gap-3">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <span>Go to Search & RAG</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/45" />
                    </Command.Item>

                    <Command.Item
                      onSelect={() => navigateTo('/analytics')}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm text-neutral-300 hover:text-foreground hover:bg-white/[0.03] cursor-pointer transition-all duration-150 aria-selected:bg-white/[0.03] aria-selected:text-foreground"
                    >
                      <div className="flex items-center gap-3">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        <span>Go to Analytics</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/45" />
                    </Command.Item>
                  </Command.Group>

                  <div className="h-px bg-white/[0.04] my-1 mx-2" />

                  <Command.Group heading="Actions" className="text-[10px] font-bold tracking-wider text-muted-foreground/80 font-sans uppercase px-3.5 py-2">
                    <Command.Item
                      onSelect={() => {
                        logout();
                        setCommandPaletteOpen(false);
                      }}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/5 cursor-pointer transition-all duration-150 aria-selected:bg-rose-500/5 aria-selected:text-rose-300"
                    >
                      <div className="flex items-center gap-3">
                        <LogOut className="h-4 w-4" />
                        <span>Log Out from Session</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-rose-500/40" />
                    </Command.Item>
                  </Command.Group>
                </Command.List>

                {/* Footer bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-white/[0.01] border-t border-white/[0.04] text-[10px] text-muted-foreground select-none font-sans">
                  <div className="flex items-center gap-4">
                    <span>↑↓ to navigate</span>
                    <span>↵ to select</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    <span>DocIntel Quick Navigator</span>
                  </div>
                </div>
              </Command>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
export default CommandPalette;
