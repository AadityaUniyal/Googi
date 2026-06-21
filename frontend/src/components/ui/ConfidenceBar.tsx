import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';

interface ConfidenceBarProps {
  score: number; // 0.0 to 1.0
  className?: string;
  showText?: boolean;
}

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({
  score,
  className,
  showText = true,
}) => {
  const percent = Math.round(score * 100);
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(percent);
    }, 150);
    return () => clearTimeout(timer);
  }, [percent]);

  // Color logic based on confidence range
  let barColor = 'bg-rose-500 shadow-rose-500/20';
  let textColor = 'text-rose-400';
  let bgColor = 'bg-rose-950/20 border-rose-900/10';

  if (percent >= 85) {
    barColor = 'bg-emerald-500 shadow-emerald-500/20';
    textColor = 'text-emerald-400';
    bgColor = 'bg-emerald-950/20 border-emerald-900/10';
  } else if (percent >= 70) {
    barColor = 'bg-amber-500 shadow-amber-500/20';
    textColor = 'text-amber-400';
    bgColor = 'bg-amber-950/20 border-amber-900/10';
  }

  return (
    <div className={clsx('flex items-center gap-3 w-full', className)}>
      <div className={clsx('relative h-2 w-full rounded-full border overflow-hidden', bgColor)}>
        <div
          className={clsx('h-full rounded-full transition-all duration-1000 ease-out shadow-sm', barColor)}
          style={{ width: `${animatedWidth}%` }}
        />
      </div>
      {showText && (
        <span className={clsx('text-xs font-mono font-semibold min-w-[36px] text-right', textColor)}>
          {percent}%
        </span>
      )}
    </div>
  );
};
