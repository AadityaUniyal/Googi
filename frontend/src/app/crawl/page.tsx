'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { 
  Globe, 
  Play, 
  RefreshCw, 
  Loader2, 
  Link2, 
  Sparkles, 
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CrawlPage() {
  const queryClient = useQueryClient();
  const [seedUrl, setSeedUrl] = useState('');
  const [depth, setDepth] = useState(2);

  // Fetch Crawled Pages
  const { data: pages, isLoading } = useQuery({
    queryKey: ['crawledPages'],
    queryFn: api.getCrawledPages,
    refetchInterval: 15000,
  });

  // Start Crawl Mutation
  const crawlMutation = useMutation({
    mutationFn: ({ url, maxDepth }: { url: string; maxDepth: number }) => api.startCrawl(url, maxDepth),
    onSuccess: (data) => {
      toast.success(data.message || 'Crawl task registered!');
      setSeedUrl('');
      queryClient.invalidateQueries({ queryKey: ['crawledPages'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to start crawl task');
    }
  });

  // Recalculate PageRank Mutation
  const pagerankMutation = useMutation({
    mutationFn: api.recalculatePageRank,
    onSuccess: (data) => {
      toast.success(data.message || 'PageRank scores updated!');
      queryClient.invalidateQueries({ queryKey: ['crawledPages'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to calculate PageRank');
    }
  });

  const handleStartCrawl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedUrl) return;
    crawlMutation.mutate({ url: seedUrl, maxDepth: depth });
  };

  return (
    <div className="flex flex-col gap-8 animate-fadeIn max-w-7xl mx-auto w-full pb-16">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Web Crawling & PageRank Console
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-sans">
            Feed URLs to index them into the RAG repository and calculate PageRank link-authority ranks.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Controls */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          {/* Crawl Form */}
          <div className="glass-card border border-white/[0.04] p-6 bg-[#0c0c0c]/80 flex flex-col gap-5">
            <h3 className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5 font-sans">
              <Sparkles className="h-4 w-4 text-accent" />
              Index New Site
            </h3>
            
            <form onSubmit={handleStartCrawl} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 font-mono">Seed URL</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={seedUrl}
                  onChange={(e) => setSeedUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors text-foreground font-sans placeholder-neutral-500"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 font-mono">Crawl Depth</label>
                <select
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors text-foreground font-sans appearance-none cursor-pointer"
                >
                  <option value={1}>Depth 1 (Seed Page Only)</option>
                  <option value={2}>Depth 2 (Follow links once)</option>
                  <option value={3}>Depth 3 (Follow links twice)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={crawlMutation.isPending}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-primary to-accent hover:from-primary-hover hover:to-accent text-white rounded-xl font-medium text-sm transition-all duration-300 shadow-lg shadow-primary/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed select-none"
              >
                {crawlMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Crawling Site...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    Start Ingestion Crawl
                  </>
                )}
              </button>
            </form>
          </div>

          {/* PageRank Tool Card */}
          <div className="glass-card border border-white/[0.04] p-6 bg-[#0c0c0c]/80 flex flex-col gap-4">
            <h3 className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5 font-sans">
              <Link2 className="h-4 w-4 text-emerald-400" />
              PageRank Authority Linker
            </h3>
            <p className="text-[10px] text-muted-foreground leading-relaxed font-sans">
              PageRank scores update automatically after crawls. Force a calculation loop to run iterations and re-weight rankings.
            </p>
            
            <button
              onClick={() => pagerankMutation.mutate()}
              disabled={pagerankMutation.isPending}
              className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-foreground rounded-xl font-medium text-sm transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed select-none"
            >
              {pagerankMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Calculating PageRank...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 text-emerald-400" />
                  Recalculate PageRank
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Side: Crawled Pages Table */}
        <div className="lg:col-span-2">
          <div className="glass-card border border-white/[0.04] p-6 bg-[#0c0c0c]/80 flex flex-col gap-6 min-h-[460px]">
            <div>
              <h3 className="text-sm font-semibold tracking-wide text-foreground font-sans">Crawled URL Index</h3>
              <p className="text-[10px] text-muted-foreground mt-1 font-sans">
                Pages indexed from seed sources and their computed network authority coefficients.
              </p>
            </div>

            <div className="flex-1 w-full overflow-x-auto">
              {isLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
              ) : !pages || pages.length === 0 ? (
                <div className="h-[300px] flex flex-col items-center justify-center gap-2 text-muted-foreground font-sans text-xs">
                  <AlertCircle className="h-5 w-5 opacity-40" />
                  <span>No pages indexed yet. Start by crawling a seed URL.</span>
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-neutral-400 font-medium">
                      <th className="pb-3 pl-1 font-bold font-mono tracking-wider uppercase text-[10px]">Title & URL</th>
                      <th className="pb-3 text-right font-bold font-mono tracking-wider uppercase text-[10px]">PageRank Score</th>
                      <th className="pb-3 pr-1 text-right font-bold font-mono tracking-wider uppercase text-[10px]">Last Indexed</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {pages.map((page, idx) => (
                        <motion.tr
                          key={page.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2, delay: idx * 0.02 }}
                          className="border-b border-white/[0.02] hover:bg-white/[0.02] group transition-colors duration-200"
                        >
                          <td className="py-3 pl-1 max-w-[320px]">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                {page.title}
                              </span>
                              <a 
                                href={page.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-[10px] text-muted-foreground truncate hover:underline"
                              >
                                {page.url}
                              </a>
                            </div>
                          </td>
                          <td className="py-3 text-right font-mono font-bold text-neutral-200">
                            {page.pagerank.toFixed(5)}
                          </td>
                          <td className="py-3 pr-1 text-right text-muted-foreground font-mono text-[10px]">
                            {new Date(page.last_crawled_at).toLocaleString()}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
        
      </div>

    </div>
  );
}
