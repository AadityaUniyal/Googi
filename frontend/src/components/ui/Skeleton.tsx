import React from 'react';
import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return <div className={clsx('skeleton h-4 w-full', className)} />;
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="glass-card p-6 flex flex-col gap-4 border border-white/[0.04] bg-[#0c0c0c] w-full">
      <Skeleton className="h-4 w-1/3 opacity-80" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-3/4 opacity-60 mt-2" />
    </div>
  );
};

export const TableRowSkeleton: React.FC = () => {
  return (
    <tr className="border-b border-white/[0.02]">
      <td className="py-4 px-4"><Skeleton className="h-5 w-8 rounded" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-32" /></td>
      <td className="py-4 px-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
      <td className="py-4 px-4"><Skeleton className="h-3 w-24 rounded-full" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-16" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-8 rounded ml-auto" /></td>
    </tr>
  );
};

export const ChartSkeleton: React.FC = () => {
  return (
    <div className="glass-card p-6 flex flex-col gap-4 h-[300px] bg-[#0c0c0c] justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-3 w-1/3 opacity-60" />
      </div>
      <div className="flex items-end gap-2 h-44 px-2">
        <Skeleton className="h-[20%] w-full" />
        <Skeleton className="h-[45%] w-full" />
        <Skeleton className="h-[30%] w-full" />
        <Skeleton className="h-[75%] w-full" />
        <Skeleton className="h-[50%] w-full" />
        <Skeleton className="h-[90%] w-full" />
        <Skeleton className="h-[60%] w-full" />
      </div>
    </div>
  );
};
