'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { KpiCard } from '@/components/ui/KpiCard';

import clsx from 'clsx';
import { 
  BarChart3, 
  Clock, 
  Activity, 
  UserCheck, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = ['#4F6EF7', '#7C3AED', '#22C55E', '#F59E0B', '#EF4444', '#6B7280'];

export default function AnalyticsPage() {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Fetch KPIs
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['kpis'],
    queryFn: api.getKpis,
    refetchInterval: 15000,
  });

  // Fetch Charts
  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ['charts'],
    queryFn: api.getCharts,
    refetchInterval: 15000,
  });

  // Fetch Audit Logs
  const { data: auditLogs, isLoading: auditLogsLoading } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => api.getAuditLogs(50),
    refetchInterval: 8000,
  });

  const dailyTrends = charts?.daily_trends || [];
  const statusDistribution = charts?.status_distribution || [];


  const handleToggleExpandLog = (id: string) => {
    setExpandedLogId(prev => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col gap-8 animate-fadeIn max-w-7xl mx-auto w-full pb-16">
      
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">Analytics & Audit Trail</h1>
        <p className="text-xs text-muted-foreground mt-1 font-sans">
          Track processing system trends, consensus accuracy indicators, and explore cryptographic audit logs.
        </p>
      </div>

      {/* Analytics KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard
          icon={Activity}
          label="Auto Processing Rate"
          value={kpis ? Math.round((1 - kpis.human_review_rate) * 100) : 0}
          suffix="%"
          trend={{ value: 3.4, isPositive: true }}
          accentColor="success"
          isLoading={kpisLoading}
        />
        <KpiCard
          icon={UserCheck}
          label="Human Review Rate"
          value={kpis ? Math.round(kpis.human_review_rate * 100) : 0}
          suffix="%"
          trend={{ value: 1.2, isPositive: false }}
          accentColor="warning"
          isLoading={kpisLoading}
        />
        <KpiCard
          icon={Clock}
          label="Average Processing Time"
          value={kpis?.average_processing_time_seconds || 0}
          suffix="s"
          decimals={1}
          accentColor="primary"
          isLoading={kpisLoading}
        />
        <KpiCard
          icon={BarChart3}
          label="Accuracy Index"
          value={kpis ? Math.round(kpis.average_accuracy * 100) : 0}
          suffix="%"
          trend={{ value: 0.5, isPositive: true }}
          accentColor="accent"
          isLoading={kpisLoading}
        />
      </div>

      {/* Visual Chart Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Weekly Trend area chart */}
        <div className="glass-card p-6 border border-white/[0.04] bg-[#0c0c0c]/85 flex flex-col gap-6 lg:col-span-2 min-h-[300px]">
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-foreground font-sans">Ingestion Volume Trend</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-sans">Historical daily document counts.</p>
          </div>

          <div className="flex-1 w-full h-full min-h-[200px]">
            {chartsLoading ? (
              <div className="h-full w-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              </div>
            ) : dailyTrends.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-center gap-2 text-muted-foreground font-sans text-xs">
                <AlertCircle className="h-5 w-5 opacity-30" />
                <span>No volume trends recorded yet.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrends} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAnalyticsVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    stroke="rgba(255,255,255,0.15)" 
                    tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'monospace' }}
                  />
                  <YAxis 
                    stroke="rgba(255,255,255,0.15)" 
                    tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'monospace' }}
                  />
                  <Tooltip
                    contentStyle={{ 
                      background: '#111', 
                      border: '1px solid rgba(255,255,255,0.06)', 
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontFamily: 'monospace'
                    }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#7C3AED" strokeWidth={2} fillOpacity={1} fill="url(#colorAnalyticsVolume)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Status Distribution Horizontal Bar Chart */}
        <div className="glass-card p-6 border border-white/[0.04] bg-[#0c0c0c]/85 flex flex-col gap-6 min-h-[300px]">
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-foreground font-sans">Pipeline Status Distribution</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-sans">Current status of documents in storage.</p>
          </div>

          <div className="flex-1 w-full h-full flex items-center justify-center min-h-[200px]">
            {chartsLoading ? (
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            ) : statusDistribution.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground font-sans text-xs">
                <AlertCircle className="h-5 w-5 opacity-30" />
                <span>No status data.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusDistribution} layout="vertical" margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                  <XAxis type="number" stroke="rgba(255,255,255,0.1)" tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'monospace' }} />
                  <YAxis dataKey="status" type="category" stroke="rgba(255,255,255,0.1)" tick={{ fill: '#888', fontSize: 9, fontFamily: 'sans-serif' }} />
                  <Tooltip
                    contentStyle={{ 
                      background: '#111', 
                      border: '1px solid rgba(255,255,255,0.06)', 
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontFamily: 'monospace'
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* Bottom Section: Audit Trail Feed */}
      <div className="glass-card p-6 border border-white/[0.04] bg-[#0c0c0c]/85 flex flex-col gap-6 w-full select-none">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-foreground font-sans">System Audit Trail</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-sans">
            Immutable tracking logs of all document uploads, reviews, lock acquisitions, and edits.
          </p>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto max-h-[400px] scrollbar pr-2">
          {auditLogsLoading ? (
            <div className="py-12 flex justify-center items-center">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
          ) : auditLogs?.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground font-sans flex flex-col items-center justify-center gap-2">
              <AlertCircle className="h-5 w-5 opacity-30" />
              <span>No audit logs recorded.</span>
            </div>
          ) : (
            auditLogs?.map((log) => {
              const isExpanded = expandedLogId === log.id;
              
              // Map action to style colors
              let actionColor = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
              if (log.action.includes('UPLOAD')) {
                actionColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
              } else if (log.action.includes('CORRECT') || log.action.includes('SUBMIT')) {
                actionColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
              } else if (log.action.includes('LOCK')) {
                actionColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
              }

              return (
                <div 
                  key={log.id}
                  className="flex flex-col border border-white/[0.04] bg-[#0f0f0f]/30 hover:bg-[#0f0f0f]/50 rounded-xl overflow-hidden transition-all duration-200"
                >
                  <div 
                    onClick={() => handleToggleExpandLog(log.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 cursor-pointer select-none text-xs text-neutral-300"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                      <span className={clsx("px-2 py-0.5 border rounded text-[9px] font-mono font-bold tracking-wider", actionColor)}>
                        {log.action}
                      </span>
                      <span className="font-semibold text-neutral-200 truncate max-w-[150px]">
                        {log.filename}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        User: <span className="font-semibold text-neutral-300">{log.operator}</span>
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-white/[0.02] bg-black/40 overflow-hidden"
                      >
                        <div className="p-4 font-mono text-[10px] text-neutral-400 select-text leading-relaxed max-h-[200px] overflow-y-auto scrollbar">
                          <pre className="whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
