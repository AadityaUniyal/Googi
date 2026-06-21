'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { KpiCard } from '@/components/ui/KpiCard';

import clsx from 'clsx';
import { 
  FileText, 
  Target, 
  Eye, 
  Zap, 
  AlertCircle,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

import Link from 'next/link';

const COLORS = ['#4F6EF7', '#7C3AED', '#22C55E', '#F59E0B', '#EF4444', '#6B7280'];

export default function DashboardPage() {
  // Fetch KPIs
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['kpis'],
    queryFn: api.getKpis,
    refetchInterval: 15000,
  });

  // Fetch Chart Data
  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ['charts'],
    queryFn: api.getCharts,
    refetchInterval: 15000,
  });

  // Fetch System Health
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 10000,
  });

  const weeklyVolume = charts?.daily_trends || [];
  const categoryDistribution = charts?.category_distribution || [];

  return (
    <div className="flex flex-col gap-8 animate-fadeIn max-w-7xl mx-auto w-full pb-16">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">System Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-1 font-sans">
            Real-time operations, processing metrics, and multi-agent validation audit pipeline.
          </p>
        </div>

        {/* Real-time Health Monitor */}
        <div className="flex items-center gap-4 bg-[#111]/40 border border-white/[0.04] p-3 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={clsx(
                "absolute inline-flex h-full w-full rounded-full opacity-75 pulse-dot",
                health?.status === 'healthy' ? "bg-emerald-400" : "bg-rose-400"
              )}></span>
              <span className={clsx(
                "relative inline-flex rounded-full h-2 w-2",
                health?.status === 'healthy' ? "bg-emerald-500" : "bg-rose-500"
              )}></span>
            </span>
            <span className="text-[10px] font-bold font-mono tracking-wider uppercase text-neutral-400">
              System: {health?.status === 'healthy' ? 'Operational' : 'Issues'}
            </span>
          </div>

          <div className="h-4 w-px bg-white/[0.06]" />

          {/* Individual services */}
          <div className="flex items-center gap-3">
            {[
              { label: 'DB', status: health?.checks?.['database']?.status },
              { label: 'MQ', status: health?.checks?.['rabbitmq']?.status },
              { label: 'Redis', status: health?.checks?.['redis']?.status },
              { label: 'Vector', status: health?.checks?.['chroma']?.status },
            ].map((srv) => (
              <div key={srv.label} className="flex items-center gap-1">
                <span className={clsx(
                  "h-1.5 w-1.5 rounded-full",
                  srv.status === 'connected' ? "bg-emerald-500" : "bg-rose-500"
                )} />
                <span className="text-[9px] font-bold font-mono text-neutral-500 uppercase">
                  {srv.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard
          icon={FileText}
          label="Total Documents"
          value={kpis?.total_documents || 0}
          trend={{ value: 12.5, isPositive: true }}
          accentColor="primary"
          isLoading={kpisLoading}
        />
        <KpiCard
          icon={Target}
          label="Average Accuracy"
          value={(kpis?.average_accuracy || 0) * 100}
          suffix="%"
          decimals={1}
          trend={{ value: 0.8, isPositive: true }}
          accentColor="success"
          isLoading={kpisLoading}
        />
        <KpiCard
          icon={Eye}
          label="Review Queue"
          value={kpis?.pending_review || 0}
          trend={{ value: 4.2, isPositive: false }}
          accentColor="warning"
          isLoading={kpisLoading}
        />
        <KpiCard
          icon={Zap}
          label="Processing Speed"
          value={kpis?.average_processing_time_seconds || 0}
          suffix="s"
          decimals={1}
          accentColor="accent"
          isLoading={kpisLoading}
        />
      </div>

      {/* Main Visuals Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Weekly Trend Area Chart */}
        <div className="glass-card p-6 border border-white/[0.04] bg-[#0c0c0c]/80 flex flex-col gap-6 lg:col-span-2 min-h-[350px]">
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-foreground font-sans">Processing Activity</h3>
            <p className="text-[10px] text-muted-foreground mt-1 font-sans">
              Daily ingestion and extraction processing volume logs.
            </p>
          </div>

          <div className="flex-1 w-full h-full min-h-[220px]">
            {chartsLoading ? (
              <div className="h-full w-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
            ) : weeklyVolume.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-muted-foreground font-sans text-xs">
                <AlertCircle className="h-5 w-5 opacity-40" />
                <span>No volume logs logged yet.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyVolume} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F6EF7" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4F6EF7" stopOpacity={0}/>
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
                  <Area type="monotone" dataKey="count" stroke="#4F6EF7" strokeWidth={2} fillOpacity={1} fill="url(#colorVolume)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Category distribution Pie Chart */}
        <div className="glass-card p-6 border border-white/[0.04] bg-[#0c0c0c]/80 flex flex-col gap-6 min-h-[350px]">
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-foreground font-sans">Document Composition</h3>
            <p className="text-[10px] text-muted-foreground mt-1 font-sans">
              Distribution of documents indexed across categories.
            </p>
          </div>

          <div className="flex-1 w-full h-full flex items-center justify-center min-h-[220px]">
            {chartsLoading ? (
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            ) : categoryDistribution.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground font-sans text-xs">
                <AlertCircle className="h-5 w-5 opacity-40" />
                <span>No classifications recorded.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="category"
                  >
                    {categoryDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ 
                      background: '#111', 
                      border: '1px solid rgba(255,255,255,0.06)', 
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontFamily: 'monospace'
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '10px', fontFamily: 'sans-serif' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* Bottom navigation hooks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none mt-2">
        <Link href="/documents" className="group glass-card border border-white/[0.04] bg-[#0c0c0c]/40 hover:bg-white/[0.01] hover:border-white/[0.06] p-6 flex items-center justify-between transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold tracking-wide text-foreground">Document Ingestion</h4>
              <p className="text-[10px] text-muted-foreground mt-0.5">Upload new invoices, agreements, or quotes to build vector index.</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>

        <Link href="/review" className="group glass-card border border-white/[0.04] bg-[#0c0c0c]/40 hover:bg-white/[0.01] hover:border-white/[0.06] p-6 flex items-center justify-between transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold tracking-wide text-foreground">Manual Audit Review</h4>
              <p className="text-[10px] text-muted-foreground mt-0.5">Examine flagged values, check arithmetic delta warnings, and approve overrides.</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </div>

    </div>
  );
}
