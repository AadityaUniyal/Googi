import React from 'react';
import CountUp from 'react-countup';
import { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  accentColor?: 'primary' | 'success' | 'warning' | 'danger' | 'accent';
  className?: string;
  isLoading?: boolean;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  icon: Icon,
  label,
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  trend,
  accentColor = 'primary',
  className,
  isLoading = false,
}) => {
  const accentColors = {
    primary: 'border-l-primary/40 focus-within:border-l-primary',
    success: 'border-l-success/40 focus-within:border-l-success',
    warning: 'border-l-warning/40 focus-within:border-l-warning',
    danger: 'border-l-danger/40 focus-within:border-l-danger',
    accent: 'border-l-accent/40 focus-within:border-l-accent',
  };

  const glowColors = {
    primary: 'group-hover:bg-primary/5',
    success: 'group-hover:bg-success/5',
    warning: 'group-hover:bg-warning/5',
    danger: 'group-hover:bg-danger/5',
    accent: 'group-hover:bg-accent/5',
  };

  if (isLoading) {
    return (
      <div className="glass-card p-6 flex flex-col gap-4 border-l-4 border-l-neutral-800 bg-[#0c0c0c]/80 min-h-[140px] animate-pulse">
        <div className="flex justify-between items-start">
          <div className="h-4 w-24 bg-neutral-800 rounded" />
          <div className="h-8 w-8 bg-neutral-800 rounded-lg" />
        </div>
        <div className="h-8 w-32 bg-neutral-800 rounded mt-2" />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'group glass-card glass-card-hover border border-white/[0.04] border-l-4 p-6 bg-[#0c0c0c]/80 flex flex-col justify-between transition-all duration-300 transform hover:-translate-y-1 select-none min-h-[140px]',
        accentColors[accentColor],
        className
      )}
    >
      <div className="flex justify-between items-start gap-4">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase font-sans">
          {label}
        </span>
        <div
          className={clsx(
            'p-2 rounded-xl border border-white/[0.04] bg-white/[0.02] text-muted-foreground transition-all duration-300',
            glowColors[accentColor]
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-2 justify-between">
        <h3 className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-baseline">
          {prefix && <span className="text-lg font-semibold mr-0.5 text-muted-foreground">{prefix}</span>}
          <CountUp end={value} decimals={decimals} duration={1.5} separator="," />
          {suffix && <span className="text-lg font-semibold ml-0.5 text-muted-foreground">{suffix}</span>}
        </h3>

        {trend && (
          <span
            className={clsx(
              'inline-flex items-center text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md border',
              trend.isPositive
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-sm shadow-emerald-950/10'
                : 'text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-sm shadow-rose-950/10'
            )}
          >
            {trend.isPositive ? '+' : '-'}
            {trend.value}%
          </span>
        )}
      </div>
    </div>
  );
};
export default KpiCard;
