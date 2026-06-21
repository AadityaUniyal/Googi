'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSearchParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { useAuthStore } from '@/stores/auth';
import clsx from 'clsx';
import { 
  Loader2, 
  AlertCircle, 
  Lock, 
  Unlock, 
  Check, 
  X, 
  RotateCcw,
  Edit2,
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface FieldUpdate {
  field_key: string;
  consensus_value: string;
}

export default function ReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const docIdParam = searchParams.get('doc_id') || '';
  const [selectedDocId, setSelectedDocId] = useState<string>(docIdParam);
  const [fieldUpdates, setFieldUpdates] = useState<Record<string, string>>({});
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Lock details
  const [isLockedByMe, setIsLockedByMe] = useState(false);
  const [lockOwner, setLockOwner] = useState<string | null>(null);
  const [lockTimeLeft, setLockTimeLeft] = useState<number>(0); // in seconds
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state with URL query param
  useEffect(() => {
    if (docIdParam && docIdParam !== selectedDocId) {
      setSelectedDocId(docIdParam);
    }
  }, [docIdParam]);

  // Fetch Review Queue (documents awaiting review or processed)
  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ['reviewQueue'],
    queryFn: async () => {
      // Get all documents and filter client-side for REVIEW queue
      const allDocs = await api.listDocuments();
      return allDocs.filter(d => d.status === 'AWAITING_REVIEW' || d.status === 'PROCESSING');
    },
    refetchInterval: 12000,
  });

  // Fetch Full Document Details when selected
  const { data: doc, isLoading: docLoading, refetch: refetchDoc } = useQuery({
    queryKey: ['documentDetails', selectedDocId],
    queryFn: () => api.getDocument(selectedDocId),
    enabled: !!selectedDocId,
  });

  // Initialize form state when document details load
  useEffect(() => {
    if (doc) {
      const initialUpdates: Record<string, string> = {};
      doc.fields.forEach((f) => {
        initialUpdates[f.field_key] = f.consensus_value || f.extracted_value || '';
      });
      setFieldUpdates(initialUpdates);
      
      // Attempt to acquire lock on the document
      acquireLockMutation.mutate(selectedDocId);
    }
    
    // Cleanup locks on unmount or document change
    return () => {
      cleanupLock();
    };
  }, [doc]);

  const cleanupLock = () => {
    if (selectedDocId && isLockedByMe) {
      api.unlockDocument(selectedDocId).catch(() => {});
    }
    setIsLockedByMe(false);
    setLockOwner(null);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  };

  // Lock Mutation
  const acquireLockMutation = useMutation({
    mutationFn: api.lockDocument,
    onSuccess: (res) => {
      setIsLockedByMe(true);
      setLockOwner(res.locked_by || user?.full_name || 'You');
      setLockTimeLeft(15 * 60); // 15 mins lock TTL
      
      toast.success('Document editing lock acquired');
      
      // Start Countdown Timer
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        setLockTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current!);
            toast.error('Your editing lock has expired!');
            setIsLockedByMe(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Start Heartbeat Renewal Timer (every 10 minutes)
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = setInterval(() => {
        // Direct call to heartbeat endpoint
        fetch(`http://localhost:8000/api/review/${selectedDocId}/heartbeat`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('doc_intel_token')}`
          }
        }).then(res => {
          if (res.ok) {
            setLockTimeLeft(15 * 60);
            logger.info('Lock lease renewed');
          }
        });
      }, 10 * 60 * 1000);
    },
    onError: (err: any) => {
      setIsLockedByMe(false);
      setLockOwner('Another reviewer');
      toast.error('This document is currently locked by another reviewer.');
    }
  });

  // Submit Review Mutation
  const submitReviewMutation = useMutation({
    mutationFn: (updates: FieldUpdate[]) => api.submitReview(selectedDocId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Review corrections approved & indexed!');
      
      // Release lock and clear select
      cleanupLock();
      setSelectedDocId('');
      router.push('/review');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to submit review');
    }
  });

  const selectDocument = (id: string) => {
    cleanupLock();
    setSelectedDocId(id);
    setFieldUpdates({});
    router.push(`/review?doc_id=${id}`);
  };

  const handleStartEdit = (key: string, currentVal: string) => {
    if (!isLockedByMe) {
      toast.error('You must hold the editing lock to modify fields');
      return;
    }
    setEditingField(key);
    setEditValue(currentVal);
  };

  const handleSaveField = (key: string) => {
    setFieldUpdates(prev => ({
      ...prev,
      [key]: editValue
    }));
    setEditingField(null);
  };

  const handleApprove = () => {
    if (!isLockedByMe) {
      toast.error('You cannot approve without holding the editing lock');
      return;
    }
    const updatesList = Object.entries(fieldUpdates).map(([key, val]) => ({
      field_key: key,
      consensus_value: val
    }));
    submitReviewMutation.mutate(updatesList);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)] w-full max-w-7xl mx-auto select-none overflow-hidden">
      
      {/* Left panel: Queue List */}
      <div className="w-80 border border-white/[0.04] bg-[#0c0c0c]/80 rounded-2xl flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-white/[0.04] bg-white/[0.01]">
          <h3 className="text-sm font-semibold tracking-wide text-foreground font-sans">Review Queue</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-sans">Select document to check extracted values.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 scrollbar">
          {queueLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
          ) : queue?.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground font-sans text-xs p-4">
              <AlertCircle className="h-5 w-5 opacity-30" />
              <span>No documents awaiting review.</span>
            </div>
          ) : (
            queue?.map((item) => (
              <button
                key={item.id}
                onClick={() => selectDocument(item.id)}
                className={clsx(
                  'w-full flex flex-col text-left p-3.5 rounded-xl border transition-all duration-300 transform cursor-pointer',
                  selectedDocId === item.id
                    ? 'bg-primary/10 border-primary/20 text-primary'
                    : 'bg-[#0f0f0f]/40 border-white/[0.04] hover:bg-white/[0.01] hover:border-white/[0.06] text-neutral-300'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-xs truncate max-w-[150px]">{item.filename}</span>
                  <Badge variant="status" value={item.status} size="sm">
                    {item.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between w-full mt-2 text-[10px] text-muted-foreground font-mono">
                  <span>Score: {item.consensus_score !== null ? `${Math.round(item.consensus_score * 100)}%` : '--'}</span>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: Details & Editor */}
      <div className="flex-1 border border-white/[0.04] bg-[#0c0c0c]/80 rounded-2xl flex flex-col overflow-hidden">
        
        {!selectedDocId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8 text-muted-foreground font-sans text-xs">
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-primary mb-2">
              <Sparkles className="h-6 w-6" />
            </div>
            <span className="font-semibold text-neutral-300 text-sm">Review Workspace</span>
            <p className="max-w-xs text-xs mt-0.5">
              Select a document from the queue on the left to start checking compliance scores and manual corrections.
            </p>
          </div>
        ) : docLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        ) : !doc ? (
          <div className="flex-1 flex items-center justify-center text-rose-400 font-sans text-xs gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load document details.</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Header info / lock status */}
            <div className="p-4 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-4.5 w-4.5 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground truncate max-w-[250px]">{doc.filename}</span>
                <Badge variant="category" value={doc.category} size="sm">
                  {doc.category}
                </Badge>
              </div>

              {/* Lock card */}
              <div className="flex items-center gap-3 bg-[#111]/40 border border-white/[0.04] py-1.5 px-3 rounded-xl text-[10px] font-mono font-semibold text-muted-foreground">
                {isLockedByMe ? (
                  <>
                    <Lock className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                    <span>Locked by me</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatTime(lockTimeLeft)}
                    </span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5 text-rose-400" />
                    <span>Locked by: {lockOwner || 'Another user'}</span>
                  </>
                )}
              </div>
            </div>

            {/* Split panel: OCR vs Editor */}
            <div className="flex-1 flex overflow-hidden">
              
              {/* Left half: raw OCR text */}
              <div className="flex-1 border-r border-white/[0.04] overflow-y-auto p-6 scrollbar bg-[#080808]/40">
                <h4 className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono mb-4">Raw OCR Output</h4>
                <pre className="text-xs font-mono text-neutral-400 leading-relaxed whitespace-pre-wrap select-text selection:bg-primary/20">
                  {doc.ocr_text || 'No text extracted.'}
                </pre>
              </div>

              {/* Right half: Editable fields form */}
              <div className="flex-1 overflow-y-auto p-6 scrollbar flex flex-col gap-6">
                <h4 className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono">Consensus Fields</h4>

                <div className="flex flex-col gap-4">
                  {doc.fields.map((field) => {
                    const isEditing = editingField === field.field_key;
                    const currentValue = fieldUpdates[field.field_key] ?? field.consensus_value ?? field.extracted_value ?? '';
                    
                    return (
                      <div 
                        key={field.id}
                        className="p-4 rounded-xl border border-white/[0.04] bg-[#0c0c0c] flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-300 font-mono">
                            {field.field_key}
                          </span>
                          <Badge variant="status" value={field.validation_status} size="sm">
                            {field.validation_status}
                          </Badge>
                        </div>

                        {/* Value & Confidence */}
                        <div className="flex items-center justify-between gap-4 py-1">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 w-full">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="flex-1 bg-[#111] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 font-mono"
                                autoFocus
                              />
                              <button 
                                onClick={() => handleSaveField(field.field_key)}
                                className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                onClick={() => setEditingField(null)}
                                className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xs font-mono font-medium text-foreground bg-[#111]/80 px-2 py-1.5 rounded-lg border border-white/[0.04]">
                                {currentValue || <span className="text-muted-foreground italic">empty</span>}
                              </span>
                              <button
                                onClick={() => handleStartEdit(field.field_key, currentValue)}
                                className="p-2 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.06] text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-200"
                                title="Override value"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="h-px bg-white/[0.02]" />

                        {/* Scores waterfall */}
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                            <span>Critic: {(field.critic_score * 100).toFixed(0)}%</span>
                            <span>Auditor: {(field.auditor_score * 100).toFixed(0)}%</span>
                            <span className="font-semibold text-neutral-300">Confidence: {(field.confidence_score * 100).toFixed(0)}%</span>
                          </div>
                          <ConfidenceBar score={field.confidence_score} showText={false} />
                        </div>

                        {field.validation_notes && (
                          <div className="flex items-start gap-1.5 text-[10px] text-amber-400 font-mono mt-1 leading-normal">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{field.validation_notes}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>

            </div>

            {/* Bottom action bar */}
            <div className="p-4 border-t border-white/[0.04] bg-white/[0.01] flex items-center justify-between select-none">
              <button
                onClick={() => selectDocument('')}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/[0.04] hover:bg-white/[0.02] text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-300"
              >
                Cancel
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleApprove}
                  disabled={!isLockedByMe || submitReviewMutation.isPending}
                  className="group flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-500 border border-emerald-500/20 text-white shadow-md shadow-emerald-950/10 cursor-pointer disabled:opacity-50 transition-all duration-300"
                >
                  {submitReviewMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Approve & Index</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}

const get_logger = (name: string) => ({
  info: (...args: any[]) => console.log(`[${name}]`, ...args),
  warning: (...args: any[]) => console.warn(`[${name}]`, ...args),
});
const logger = get_logger('ReviewPage');
