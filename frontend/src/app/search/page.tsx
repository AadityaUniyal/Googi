'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import clsx from 'clsx';
import { 
  SearchIcon, 
  MessageSquare, 
  Send, 
  Sparkles, 
  Loader2, 
  FileText,
  AlertCircle,
  Database,
  ArrowRight,
  ChevronRight,
  CheckSquare,
  Square,
  Globe
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'semantic' | 'metadata'>('semantic');
  const [category, setCategory] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // RAG Chat state
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Search Query
  const { data: results, isLoading, refetch } = useQuery({
    queryKey: ['search', query, category],
    queryFn: async () => {
      if (!query.strip()) return [];
      return api.searchMetadata(query, category || undefined);
    },
    enabled: false, // Only trigger on enter or button click
  });

  const handleInputChange = async (val: string) => {
    setQuery(val);
    if (val.trim().length > 1) {
      try {
        const sugs = await api.searchSuggest(val);
        setSuggestions(sugs);
      } catch (e) {
        console.error(e);
      }
    } else {
      setSuggestions([]);
    }
  };

  const handleSelectSuggestion = (sug: string) => {
    setQuery(sug);
    setSuggestions([]);
    setShowSuggestions(false);
    // Trigger search after state update
    setTimeout(() => {
      refetch();
    }, 50);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.strip()) {
      toast.error('Please enter a search query');
      return;
    }
    setSuggestions([]);
    setShowSuggestions(false);
    refetch();
  };

  const handleToggleDocSelect = (docId: string) => {
    setSelectedDocIds((prev) => {
      const isSelected = prev.includes(docId);
      const nextList = isSelected ? prev.filter((id) => id !== docId) : [...prev, docId];
      if (nextList.length > 0) {
        setIsChatOpen(true);
      } else {
        setIsChatOpen(false);
      }
      return nextList;
    });
  };

  // RAG Chat Mutation
  const ragMutation = useMutation({
    mutationFn: (question: string) => api.askRagChat(selectedDocIds, question),
    onSuccess: (data) => {
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer }
      ]);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to get answer from AI agent');
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error while indexing the knowledgebase context.' }
      ]);
    }
  });

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.strip() || ragMutation.isPending) return;

    const userMessage = chatInput;
    setChatHistory((prev) => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    
    ragMutation.mutate(userMessage);
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)] w-full max-w-7xl mx-auto select-none overflow-hidden relative">
      
      {/* Left Area: Search bar & results */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        
        {/* Search header info */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">Cognitive RAG Search</h1>
          <p className="text-xs text-muted-foreground mt-1 font-sans">
            Search document database semantically using embeddings or filter by index metadata parameters.
          </p>
        </div>

        {/* Large Rounded Search Bar Form */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-3 bg-[#0c0c0c]/85 border border-white/[0.06] p-2 pl-4 rounded-2xl shadow-xl">
            <SearchIcon className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="relative flex-grow flex items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Search e.g. 'Stellar Dynamics titanium rods prices' or type:invoice..."
                className="w-full bg-transparent border-0 text-neutral-200 placeholder-neutral-500 text-sm focus:outline-none focus:ring-0 font-sans"
              />
              
              {/* Autocomplete Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-[-16px] right-0 mt-3.5 bg-[#0c0c0c]/95 border border-white/[0.06] rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl max-w-md">
                  {suggestions.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectSuggestion(sug)}
                      className="w-full text-left px-4 py-3 text-xs text-neutral-300 hover:bg-primary/15 hover:text-primary transition-colors border-b border-white/[0.02] last:border-b-0 cursor-pointer flex items-center gap-2 font-sans"
                    >
                      <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Mode selection toggle */}
            <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-white/[0.04] shrink-0">
              <button
                type="button"
                onClick={() => setSearchMode('semantic')}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold font-sans cursor-pointer transition-all duration-200",
                  searchMode === 'semantic' ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Semantic
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('metadata')}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold font-sans cursor-pointer transition-all duration-200",
                  searchMode === 'metadata' ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Metadata
              </button>
            </div>

            {/* Category dropdown */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[#111] border border-white/[0.06] rounded-xl px-3 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-primary/50 shrink-0 font-sans cursor-pointer mr-1"
            >
              <option value="">All Types</option>
              <option value="INVOICE">Invoices</option>
              <option value="RFQ">RFQs</option>
              <option value="CONTRACT">Contracts</option>
              <option value="COMPLIANCE">Compliance</option>
            </select>
          </div>
        </form>

        {/* Search Results list */}
        <div className="flex-1 overflow-y-auto pr-2 scrollbar flex flex-col gap-4">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
          ) : !results ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground font-sans text-xs">
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-primary mb-1">
                <Sparkles className="h-6 w-6" />
              </div>
              <span className="font-semibold text-neutral-300 text-sm">Cognitive Search Interface</span>
              <p className="max-w-xs text-xs mt-0.5">
                Enter your query above. Semantic search matches meaning and concepts, while Metadata filters match precise index keys.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground font-sans text-xs">
              <AlertCircle className="h-5 w-5 opacity-30" />
              <span>No matching document chunks found in index.</span>
            </div>
          ) : (
            results.map((item: any) => {
              const isSelected = selectedDocIds.includes(item.id);
              
              return (
                <div 
                  key={item.id}
                  className={clsx(
                    "group glass-card p-5 border bg-[#0c0c0c]/85 hover:bg-[#0c0c0c] transition-all duration-300 flex gap-4 items-start relative overflow-hidden",
                    isSelected ? "border-primary/30" : "border-white/[0.04] hover:border-white/[0.08]"
                  )}
                >
                  {/* Select check button for RAG */}
                  <button
                    onClick={() => handleToggleDocSelect(item.id)}
                    className="p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer mt-1 shrink-0"
                  >
                    {isSelected ? (
                      <CheckSquare className="h-4.5 w-4.5 text-primary" />
                    ) : (
                      <Square className="h-4.5 w-4.5 opacity-60" />
                    )}
                  </button>

                  <div className="flex-grow flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {item.type === 'web' ? (
                          <Globe className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        {item.type === 'web' ? (
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-xs font-bold text-neutral-200 hover:text-primary hover:underline truncate max-w-[240px]"
                          >
                            {item.filename}
                          </a>
                        ) : (
                          <span className="text-xs font-bold text-neutral-200 truncate max-w-[200px]">{item.filename}</span>
                        )}
                        <Badge variant="category" value={item.category} size="sm">
                          {item.category}
                        </Badge>
                      </div>
                      
                      {item.score !== undefined && item.score !== null ? (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Relevance: {Math.round(item.score * 100)}%
                        </span>
                      ) : item.consensus_score !== null && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Match: {Math.round(item.consensus_score * 100)}%
                        </span>
                      )}
                    </div>

                    {/* Excerpt text display with keyword highlights */}
                    {(item.snippet || item.excerpt) && (
                      <div 
                        className="mt-1 bg-black/35 border border-white/[0.02] p-3 rounded-lg text-xs font-mono text-neutral-400 select-text leading-relaxed whitespace-pre-wrap [&>mark]:bg-primary/20 [&>mark]:text-primary [&>mark]:px-1 [&>mark]:rounded"
                        dangerouslySetInnerHTML={{ __html: item.snippet || item.excerpt }}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Right Area: RAG Chat Panel (slides in if document(s) selected) */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="border-l border-white/[0.04] bg-[#0c0c0c]/90 flex flex-col shrink-0 overflow-hidden h-full z-10"
          >
            {/* Chat header */}
            <div className="p-4 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-primary">
                <MessageSquare className="h-4.5 w-4.5" />
                <span className="text-xs font-bold tracking-wider uppercase font-sans">RAG Copilot Chat</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-muted-foreground bg-white/[0.03] px-2 py-0.5 rounded-full border border-white/[0.04]">
                Context: {selectedDocIds.length} docs
              </span>
            </div>

            {/* Chat Messages flow */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar flex flex-col gap-4 bg-[#080808]/20">
              {chatHistory.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center text-center gap-2 text-muted-foreground font-sans text-xs py-12">
                  <Sparkles className="h-5 w-5 text-primary/60 animate-pulse" />
                  <span>Ask a question about the selected document context...</span>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div 
                    key={idx}
                    className={clsx(
                      "flex flex-col gap-1 max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed font-sans",
                      msg.role === 'user'
                        ? "bg-primary border border-primary/20 text-white self-end rounded-tr-none"
                        : "bg-[#111] border border-white/[0.04] text-neutral-300 self-start rounded-tl-none select-text"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))
              )}

              {/* RAG Thinking loader */}
              {ragMutation.isPending && (
                <div className="bg-[#111] border border-white/[0.04] text-neutral-400 self-start rounded-2xl rounded-tl-none px-3.5 py-2.5 text-xs flex items-center gap-2 font-sans select-none animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                  <span>AI agent analyzing document context...</span>
                </div>
              )}
            </div>

            {/* Chat Input form */}
            <form onSubmit={handleSendChatMessage} className="p-4 border-t border-white/[0.04] bg-white/[0.01] flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about prices, dates, terms..."
                disabled={ragMutation.isPending}
                className="flex-1 bg-[#111] border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:border-primary/50 font-sans"
              />
              <button
                type="submit"
                disabled={!chatInput.strip() || ragMutation.isPending}
                className="p-2.5 rounded-xl bg-primary border border-primary/20 text-white hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer shadow-md shadow-primary/10 shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// string helper for safety
if (!String.prototype.strip) {
  String.prototype.strip = function() {
    return this.trim();
  };
}
declare global {
  interface String {
    strip(): string;
  }
}
