import React from 'react';
import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'status' | 'category';
  value: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'status',
  value,
  size = 'md',
  className,
}) => {
  const normalizedValue = value.toUpperCase();

  // Determine colors based on status/category value
  let colorClass = 'bg-neutral-800 text-neutral-400 border-neutral-700/50 shadow-neutral-900/10';

  if (variant === 'status') {
    switch (normalizedValue) {
      case 'PROCESSED':
        colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-950/20';
        break;
      case 'PROCESSING':
        colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-blue-950/20 animate-pulse';
        break;
      case 'AWAITING_REVIEW':
        colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-amber-950/20';
        break;
      case 'FAILED':
        colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-rose-950/20';
        break;
      case 'INGESTED':
        colorClass = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20 shadow-zinc-950/20';
        break;
    }
  } else if (variant === 'category') {
    switch (normalizedValue) {
      case 'INVOICE':
        colorClass = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-indigo-950/20';
        break;
      case 'RFQ':
        colorClass = 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-purple-950/20';
        break;
      case 'PURCHASE_ORDER':
        colorClass = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-cyan-950/20';
        break;
      case 'CONTRACT':
        colorClass = 'bg-teal-500/10 text-teal-400 border-teal-500/20 shadow-teal-950/20';
        break;
      case 'COMPLIANCE':
        colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-amber-950/20';
        break;
      case 'UNKNOWN':
      default:
        colorClass = 'bg-zinc-800 text-zinc-400 border-zinc-700/50';
        break;
    }
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] font-medium tracking-wide border',
    md: 'px-2.5 py-1 text-xs font-semibold tracking-wide border',
    lg: 'px-3.5 py-1.5 text-sm font-semibold tracking-wide border',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full shadow-sm select-none transition-all duration-300 font-mono',
        sizeClasses[size],
        colorClass,
        className
      )}
    >
      {children}
    </span>
  );
};
