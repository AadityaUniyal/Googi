'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { TableRowSkeleton } from '@/components/ui/Skeleton';
import clsx from 'clsx';
import { 
  UploadCloud, 
  FileText, 
  Trash2, 
  RefreshCw, 
  Filter, 
  AlertCircle,
  Eye, 
  CheckCircle2, 
  XCircle,
  Clock,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([]);

  // Fetch Documents
  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents', selectedCategory, selectedStatus],
    queryFn: () => api.listDocuments(selectedCategory || undefined, selectedStatus || undefined),
    refetchInterval: 10000,
  });

  // Reprocess Mutation
  const reprocessMutation = useMutation({
    mutationFn: api.reprocessDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document re-processing queued');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to queue re-processing');
    }
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: api.deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete document');
    }
  });

  // Dropzone File Upload
  const onDrop = async (acceptedFiles: File[]) => {
    const uploadPromises = acceptedFiles.map(async (file) => {
      // Add to uploading list
      setUploadingFiles((prev) => [...prev, { name: file.name, progress: 20 }]);
      
      try {
        await api.uploadDocument(file);
        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name));
        toast.success(`Uploaded ${file.name} successfully!`);
      } catch (err: any) {
        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name));
        toast.error(`Failed to upload ${file.name}: ${err.message || 'Duplicate or invalid'}`);
      }
    });

    await Promise.all(uploadPromises);
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['kpis'] });
    queryClient.invalidateQueries({ queryKey: ['charts'] });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 10 * 1024 * 1024, // 10MB
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/tiff': ['.tiff']
    }
  });

  return (
    <div className="flex flex-col gap-8 animate-fadeIn max-w-7xl mx-auto w-full pb-16">
      
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">Document Pipeline</h1>
        <p className="text-xs text-muted-foreground mt-1 font-sans">
          Upload commercial documents (PDFs, images, docx) to classify, extract, and index semantically.
        </p>
      </div>

      {/* Upload Dropzone */}
      <div 
        {...getRootProps()} 
        className={clsx(
          "relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 min-h-[180px] bg-[#0c0c0c]/40 shadow-inner select-none",
          isDragActive 
            ? "border-primary bg-primary/5 shadow-primary/5" 
            : "border-white/[0.06] hover:border-white/[0.12] hover:bg-[#0c0c0c]/60"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-muted-foreground group-hover:text-foreground transition-all duration-300">
            <UploadCloud className="h-6 w-6 text-primary" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-neutral-200">
              {isDragActive ? 'Drop the files here' : 'Drag & drop files here, or click to browse'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Supports PDF, DOCX, TXT, PNG, JPG, TIFF up to 10 MB.
            </p>
          </div>
        </div>
      </div>

      {/* Active Uploads List */}
      <AnimatePresence>
        {uploadingFiles.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2 p-4 rounded-xl border border-white/[0.04] bg-[#0c0c0c]/80"
          >
            <span className="text-[10px] font-bold font-mono tracking-wider uppercase text-neutral-400 flex items-center gap-2">
              <Loader2 className="h-3 w-3 text-primary animate-spin" /> Ingestion active ({uploadingFiles.length})
            </span>
            <div className="flex flex-col gap-2 mt-2">
              {uploadingFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono py-1 border-b border-white/[0.02] last:border-0 text-muted-foreground">
                  <span className="truncate max-w-[200px]">{file.name}</span>
                  <span className="text-primary animate-pulse">processing...</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters / Headers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.04] pb-4">
        
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
            <Filter className="h-3.5 w-3.5" />
            <span className="font-semibold">Filters:</span>
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-[#111] border border-white/[0.06] rounded-xl px-3 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-primary/50"
          >
            <option value="">All Categories</option>
            <option value="INVOICE">Invoices</option>
            <option value="RFQ">RFQs</option>
            <option value="CONTRACT">Contracts</option>
            <option value="COMPLIANCE">Compliance Certificates</option>
            <option value="PURCHASE_ORDER">Purchase Orders</option>
          </select>

          {/* Status Dropdown */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-[#111] border border-white/[0.06] rounded-xl px-3 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-primary/50"
          >
            <option value="">All Statuses</option>
            <option value="INGESTED">Ingested</option>
            <option value="PROCESSING">Processing</option>
            <option value="AWAITING_REVIEW">Awaiting Review</option>
            <option value="PROCESSED">Processed</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        <span className="text-xs font-mono font-semibold text-muted-foreground self-end sm:self-center">
          Count: {documents?.length || 0}
        </span>
      </div>

      {/* Documents Table */}
      <div className="glass-card border border-white/[0.04] bg-[#0c0c0c]/80 overflow-hidden shadow-2xl rounded-2xl select-none">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.04] bg-white/[0.01] text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono">
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4">Ingested At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRowSkeleton key={idx} />
                ))
              ) : documents?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2.5 text-muted-foreground font-sans text-xs">
                      <AlertCircle className="h-6 w-6 opacity-30" />
                      <span className="font-semibold text-neutral-400">No documents found matching the criteria.</span>
                      <span>Try dragging in a commercial PDF/image above.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                documents?.map((doc) => (
                  <tr 
                    key={doc.id} 
                    className="hover:bg-white/[0.01] transition-colors duration-200 text-xs text-neutral-300 font-sans"
                  >
                    {/* Status */}
                    <td className="py-4 px-4 align-middle">
                      <Badge variant="status" value={doc.status}>
                        {doc.status}
                      </Badge>
                    </td>

                    {/* Filename */}
                    <td className="py-4 px-4 align-middle font-medium text-foreground truncate max-w-[200px]">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{doc.filename}</span>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-4 px-4 align-middle">
                      <Badge variant="category" value={doc.category}>
                        {doc.category}
                      </Badge>
                    </td>

                    {/* Confidence Score */}
                    <td className="py-4 px-4 align-middle w-48">
                      {doc.consensus_score !== null ? (
                        <ConfidenceBar score={doc.consensus_score} showText={true} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-mono">--</span>
                      )}
                    </td>

                    {/* Ingestion date */}
                    <td className="py-4 px-4 align-middle font-mono text-muted-foreground text-[10px] whitespace-nowrap">
                      {new Date(doc.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 align-middle text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        
                        {/* Go to Review details */}
                        {(doc.status === 'AWAITING_REVIEW' || doc.status === 'PROCESSED') && (
                          <Link
                            href={`/review?doc_id=${doc.id}`}
                            className="p-2 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.06] hover:border-white/[0.08] text-neutral-300 hover:text-foreground cursor-pointer transition-all duration-200"
                            title="Inspect extraction fields"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        )}

                        {/* Reprocess */}
                        <button
                          onClick={() => reprocessMutation.mutate(doc.id)}
                          disabled={reprocessMutation.isPending}
                          className="p-2 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.06] hover:border-white/[0.08] text-neutral-300 hover:text-foreground cursor-pointer disabled:opacity-50 transition-all duration-200"
                          title="Queue re-processing"
                        >
                          <RefreshCw className={clsx("h-3.5 w-3.5", reprocessMutation.isPending && "animate-spin")} />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this document?')) {
                              deleteMutation.mutate(doc.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="p-2 rounded-lg border border-white/[0.04] bg-[#500]/5 hover:bg-rose-500/10 border-transparent text-rose-400 hover:text-rose-300 hover:border-rose-500/20 cursor-pointer disabled:opacity-50 transition-all duration-200"
                          title="Delete permanently"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
