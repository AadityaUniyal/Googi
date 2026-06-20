"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  BarChart3, Upload, Search, ShieldCheck, RefreshCw, FileText, 
  Trash2, User, Key, Eye, HelpCircle, LogOut, CheckCircle, 
  AlertTriangle, Lock, FileDigit, Calendar, Clock, Sparkles, Send, 
  Info, Check, ChevronRight, X
} from "lucide-react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, Cell, PieChart, Pie
} from "recharts";
import { api, DocumentSimpleResponse, DocumentResponse, KPIMetrics, ChartData, AuditLogResponse } from "@/lib/api";

const CATEGORY_COLORS: Record<string, string> = {
  INVOICE: "#6366f1",
  RFQ: "#10b981",
  PURCHASE_ORDER: "#f59e0b",
  CONTRACT: "#8b5cf6",
  COMPLIANCE: "#ec4899",
  UNKNOWN: "#6b7280"
};

export default function Home() {
  // Authentication state
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authRole, setAuthRole] = useState("VIEWER");
  const [authError, setAuthError] = useState("");

  // Navigation tab
  const [activeTab, setActiveTab] = useState("dashboard");

  // Global lists & details
  const [documents, setDocuments] = useState<DocumentSimpleResponse[]>([]);
  const [kpis, setKpis] = useState<KPIMetrics | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<{ file: File; status: string; progress: number }[]>([]);

  // Review state
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewDoc, setReviewDoc] = useState<DocumentResponse | null>(null);
  const [reviewDraft, setReviewDraft] = useState<Record<string, string>>({});
  const [reviewLockError, setReviewLockError] = useState("");

  // Search & RAG state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchType, setSearchType] = useState<"metadata" | "semantic">("metadata");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedDocsForRag, setSelectedDocsForRag] = useState<string[]>([]);
  const [ragQuestion, setRagQuestion] = useState("");
  const [ragChat, setRagChat] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [isRagLoading, setIsRagLoading] = useState(false);

  // Sync token from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("doc_intel_token");
    if (savedToken) {
      setToken(savedToken);
      fetchMe();
    }
  }, []);

  // Fetch metrics and lists on active tab changes
  useEffect(() => {
    if (token) {
      fetchGeneralData();
    }
  }, [token, activeTab]);

  const fetchMe = async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch {
      handleLogout();
    }
  };

  const fetchGeneralData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === "dashboard") {
        const k = await api.getKpis();
        setKpis(k);
        const c = await api.getCharts();
        setCharts(c);
      } else if (activeTab === "upload") {
        const docs = await api.listDocuments();
        setDocuments(docs);
      } else if (activeTab === "review") {
        const queue = await api.getReviewQueue();
        setDocuments(queue);
      } else if (activeTab === "search") {
        const docs = await api.listDocuments();
        setDocuments(docs);
        triggerMetadataSearch();
      } else if (activeTab === "audit") {
        const logs = await api.getAuditLogs(30);
        setAuditLogs(logs);
      }
    } catch (err: any) {
      console.error("Fetch data error", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await api.login(authEmail, authPassword);
      localStorage.setItem("doc_intel_token", res.access_token);
      setToken(res.access_token);
      await fetchMe();
      setActiveTab("dashboard");
    } catch (err: any) {
      setAuthError(err.message || "Failed to log in");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      await api.register(authEmail, authPassword, authName, authRole);
      // Automatically login
      const res = await api.login(authEmail, authPassword);
      localStorage.setItem("doc_intel_token", res.access_token);
      setToken(res.access_token);
      await fetchMe();
      setActiveTab("dashboard");
    } catch (err: any) {
      setAuthError(err.message || "Failed to register");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("doc_intel_token");
    setToken(null);
    setUser(null);
    setActiveTab("dashboard");
  };

  // --- UPLOAD PIPELINE ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        status: "Queued",
        progress: 0
      }));
      setUploadFiles(prev => [...prev, ...newFiles]);
    }
  };

  const triggerUpload = async (index: number) => {
    const item = uploadFiles[index];
    setUploadFiles(prev => prev.map((f, i) => i === index ? { ...f, status: "Uploading" } : f));
    
    try {
      await api.uploadDocument(item.file);
      setUploadFiles(prev => prev.map((f, i) => i === index ? { ...f, status: "Success", progress: 100 } : f));
      fetchGeneralData();
    } catch (err: any) {
      setUploadFiles(prev => prev.map((f, i) => i === index ? { ...f, status: `Error: ${err.message}` } : f));
    }
  };

  const triggerAllUploads = () => {
    uploadFiles.forEach((f, i) => {
      if (f.status === "Queued") {
        triggerUpload(i);
      }
    });
  };

  const removeUploadItem = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  // --- REVIEW PIPELINE ---
  const openReviewModal = async (id: string) => {
    setActiveReviewId(id);
    setReviewDoc(null);
    setReviewDraft({});
    setReviewLockError("");
    
    try {
      // 1. Lock document
      await api.lockDocument(id);
      
      // 2. Fetch doc details
      const doc = await api.getDocument(id);
      setReviewDoc(doc);
      
      // Populate draft fields
      const draft: Record<string, string> = {};
      doc.fields.forEach(f => {
        draft[f.field_key] = f.consensus_value || "";
      });
      setReviewDraft(draft);
    } catch (err: any) {
      setReviewLockError(err.message || "Failed to lock document for review.");
      // Attempt to load anyway (view mode)
      try {
        const doc = await api.getDocument(id);
        setReviewDoc(doc);
      } catch {}
    }
  };

  const closeReviewModal = async () => {
    if (activeReviewId && !reviewLockError) {
      try {
        await api.unlockDocument(activeReviewId);
      } catch (e) {
        console.error(e);
      }
    }
    setActiveReviewId(null);
    setReviewDoc(null);
    setReviewDraft({});
    fetchGeneralData();
  };

  const handleFieldChange = (key: string, value: string) => {
    setReviewDraft(prev => ({ ...prev, [key]: value }));
  };

  const submitReview = async () => {
    if (!activeReviewId) return;
    try {
      const updates = Object.entries(reviewDraft).map(([field_key, consensus_value]) => ({
        field_key,
        consensus_value
      }));
      await api.submitReview(activeReviewId, updates);
      closeReviewModal();
    } catch (err: any) {
      alert("Failed to submit review: " + err.message);
    }
  };

  const deleteDoc = async (id: string) => {
    if (confirm("Are you sure you want to delete this document? All fields and semantic vector indexes will be permanently removed.")) {
      try {
        await api.deleteDocument(id);
        fetchGeneralData();
      } catch (err: any) {
        alert("Failed to delete document: " + err.message);
      }
    }
  };

  // Reprocess Document
  const reprocessDoc = async (id: string) => {
    try {
      await api.reprocessDocument(id);
      alert("Reprocessing triggered. The document has been enqueued.");
      fetchGeneralData();
    } catch (err: any) {
      alert("Failed to trigger reprocessing: " + err.message);
    }
  };

  // --- SEARCH & RAG ---
  const triggerMetadataSearch = async () => {
    setIsLoading(true);
    try {
      const res = await api.searchMetadata(searchQuery, searchCategory || undefined);
      setSearchResults(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerSemanticSearch = async () => {
    if (!searchQuery.trim()) {
      triggerMetadataSearch();
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.searchSemantic(searchQuery, searchCategory || undefined);
      setSearchResults(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchType === "semantic") {
      triggerSemanticSearch();
    } else {
      triggerMetadataSearch();
    }
  };

  const toggleDocForRag = (id: string) => {
    setSelectedDocsForRag(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllSearchResultsForRag = () => {
    const ids = searchResults.map(r => r.id || r.document_id).filter(id => id);
    setSelectedDocsForRag(ids);
  };

  const triggerRagChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuestion.trim() || selectedDocsForRag.length === 0) return;
    
    const q = ragQuestion;
    setRagQuestion("");
    setRagChat(prev => [...prev, { role: "user", text: q }]);
    setIsRagLoading(true);
    
    try {
      const res = await api.askRagChat(selectedDocsForRag, q);
      setRagChat(prev => [...prev, { role: "assistant", text: res.answer }]);
    } catch (err: any) {
      setRagChat(prev => [...prev, { role: "assistant", text: `Error generating answer: ${err.message}` }]);
    } finally {
      setIsRagLoading(false);
    }
  };

  const getFieldColor = (score: number, status: string) => {
    if (status === "MANUAL_CORRECTION") return "border-blue-500 bg-blue-50 text-blue-900";
    if (score >= 0.85) return "border-emerald-500 bg-emerald-50 text-emerald-900";
    if (score >= 0.6) return "border-amber-500 bg-amber-50 text-amber-900";
    return "border-rose-500 bg-rose-50 text-rose-900";
  };

  const getBadgeColor = (status: string) => {
    switch (status) {
      case "PROCESSED": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "AWAITING_REVIEW": return "bg-amber-100 text-amber-800 border-amber-200";
      case "PROCESSING": return "bg-blue-100 text-blue-800 border-blue-200 animate-pulse";
      case "FAILED": return "bg-rose-100 text-rose-800 border-rose-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // --- AUTH PORTAL IF NO TOKEN ---
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-full max-w-md backdrop-blur-xl bg-slate-900/60 border border-slate-800 p-8 rounded-3xl shadow-2xl relative">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-teal-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/25">
              <ShieldCheck className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent text-center">
              DocIntel AI Platform
            </h1>
            <p className="text-slate-400 text-sm mt-1 text-center">
              Distributed Document Auditing & Extraction
            </p>
          </div>

          {authError && (
            <div className="mb-6 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={isLoginView ? handleLogin : handleRegister} className="space-y-4">
            {!isLoginView && (
              <div>
                <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-3 text-slate-500 w-4 h-4" />
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Email Address</label>
              <div className="relative">
                <User className="absolute left-4 top-3 text-slate-500 w-4 h-4" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Key className="absolute left-4 top-3 text-slate-500 w-4 h-4" />
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                />
              </div>
            </div>

            {!isLoginView && (
              <div>
                <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Security Role</label>
                <select
                  value={authRole}
                  onChange={(e) => setAuthRole(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 text-sm transition-all"
                >
                  <option value="VIEWER">Viewer (Read-only)</option>
                  <option value="REVIEWER">Reviewer (Validate extractions)</option>
                  <option value="OPERATOR">Operator (Upload & Reprocess)</option>
                  <option value="ADMIN">Administrator (Full Access)</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 mt-4 bg-gradient-to-r from-indigo-500 to-teal-500 hover:from-indigo-600 hover:to-teal-600 text-white font-semibold rounded-xl text-sm shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              {isLoginView ? "Log In to Workspace" : "Create Enterprise Account"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
            <button
              onClick={() => {
                setIsLoginView(!isLoginView);
                setAuthError("");
              }}
              className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-all cursor-pointer"
            >
              {isLoginView ? "Need an account? Sign up instead" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- CORE PLATFORM WORKSPACE ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans">
      {/* Dynamic Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-r border-slate-800 bg-slate-900/50 backdrop-blur-md flex flex-col justify-between shrink-0">
        <div>
          {/* Brand Logo */}
          <div className="p-6 border-b border-slate-800 flex items-center gap-3 bg-slate-900/80">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-teal-500 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/10">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight text-white leading-none">DocIntel Platform</h2>
              <span className="text-xs text-slate-500">Google SWE intern showcase</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {[
              { id: "dashboard", label: "Dashboard", icon: BarChart3 },
              { id: "upload", label: "Document Ingestion", icon: Upload },
              { id: "review", label: "Review Queue", icon: Clock },
              { id: "search", label: "Search & RAG Chat", icon: Search },
              { id: "audit", label: "Audit Logs Feed", icon: FileDigit }
            ].map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (activeReviewId) closeReviewModal();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    active 
                      ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 shadow-md shadow-indigo-500/5" 
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Card & Logout */}
        {user && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/40">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                  {user.full_name.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white leading-tight">{user.full_name}</h4>
                  <span className="text-[10px] text-teal-400 font-semibold tracking-wider uppercase">{user.role}</span>
                </div>
              </div>
              <button 
                onClick={handleLogout} 
                title="Log Out"
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-600 truncate">{user.email}</p>
          </div>
        )}
      </aside>

      {/* Main Workspace Panels */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {/* Dynamic header info */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              {activeTab === "dashboard" && "Platform Operations Control"}
              {activeTab === "upload" && "Secure Ingestion Console"}
              {activeTab === "review" && "Human-in-the-Loop Review Queue"}
              {activeTab === "search" && "Cognitive Search Engine & RAG"}
              {activeTab === "audit" && "Continuous Compliance Audit Feed"}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {activeTab === "dashboard" && "Real-time accuracy KPIs, throughput, and service container statuses."}
              {activeTab === "upload" && "Upload files securely to run multi-agent OCR auditing. Max size: 10MB."}
              {activeTab === "review" && "Review files that flagged logical errors or fell below the 85% confidence score threshold."}
              {activeTab === "search" && "Query documents semantically and ask contextual questions to the corpus."}
              {activeTab === "audit" && "Immutably log reviewer corrections, system events, and data changes."}
            </p>
          </div>
          <button
            onClick={fetchGeneralData}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl text-sm transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Reload Logs</span>
          </button>
        </header>

        {/* --- PANEL 1: DASHBOARD --- */}
        {activeTab === "dashboard" && kpis && (
          <div className="space-y-8 animate-fadeIn">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { 
                  label: "Total Ingested", 
                  value: kpis.total_documents, 
                  desc: `${kpis.processed_documents} finished processing`, 
                  icon: FileText, 
                  color: "from-indigo-500/10 to-indigo-500/5 text-indigo-400" 
                },
                { 
                  label: "Average Accuracy Score", 
                  value: `${kpis.average_accuracy}%`, 
                  desc: "Consensus validation index", 
                  icon: CheckCircle, 
                  color: "from-emerald-500/10 to-emerald-500/5 text-emerald-400" 
                },
                { 
                  label: "Human Review Needed", 
                  value: kpis.pending_review, 
                  desc: `${kpis.human_review_rate}% intervention rate`, 
                  icon: Clock, 
                  color: "from-amber-500/10 to-amber-500/5 text-amber-400" 
                },
                { 
                  label: "Mean Processing Speed", 
                  value: `${kpis.average_processing_time_seconds}s`, 
                  desc: "Event execution pipeline speed", 
                  icon: Sparkles, 
                  color: "from-teal-500/10 to-teal-500/5 text-teal-400" 
                }
              ].map((card, i) => {
                const Icon = card.icon;
                return (
                  <div key={i} className={`p-6 border border-slate-800 bg-slate-900/30 rounded-2xl flex items-center justify-between shadow-sm relative overflow-hidden`}>
                    <div className="space-y-1">
                      <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{card.label}</span>
                      <h3 className="text-2xl font-bold text-white tracking-tight">{card.value}</h3>
                      <p className="text-slate-500 text-xs">{card.desc}</p>
                    </div>
                    <div className={`p-3 bg-gradient-to-tr ${card.color} rounded-xl`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Graphs Layout */}
            {charts && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Area Chart: Ingestion Trend */}
                <div className="p-6 border border-slate-800 bg-slate-900/30 rounded-2xl lg:col-span-2">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-6">Weekly Ingestion Volumes</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={charts.daily_trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                        <XAxis dataKey="date" stroke="#64748b" fontSize={11}/>
                        <YAxis stroke="#64748b" fontSize={11}/>
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}/>
                        <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)"/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie Chart: Document Type Categories */}
                <div className="p-6 border border-slate-800 bg-slate-900/30 rounded-2xl flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-6 font-semibold">Category Distributions</h3>
                    <div className="h-48 relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={charts.category_distribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="count"
                            nameKey="category"
                          >
                            {charts.category_distribution.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.category] || "#94a3b8"} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Legend Grid */}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {charts.category_distribution.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[item.category] }}></span>
                        <span className="text-slate-400 font-medium truncate">{item.category}: {item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Container status indicators */}
            <div className="p-6 border border-slate-800 bg-slate-900/30 rounded-2xl">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Pipeline Node Monitor</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { name: "Neon Database Server", status: "Connected", desc: "Remote AWS East-1 Pooler", ping: "< 12ms", state: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                  { name: "RabbitMQ Events Broker", status: "Active (Local Fallback Ready)", desc: "Event dispatch queues active", ping: "Broker loop active", state: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
                  { name: "ChromaDB Semantic Engine", status: "Ready", desc: "SQLite Persistent Vector Client", ping: "Index online", state: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" }
                ].map((node, i) => (
                  <div key={i} className={`p-4 rounded-xl border ${node.state} flex flex-col justify-between gap-2`}>
                    <div>
                      <h4 className="text-xs font-bold text-white leading-none mb-1">{node.name}</h4>
                      <p className="text-[10px] text-slate-400">{node.desc}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs font-semibold pt-2 border-t border-slate-800/10">
                      <span>{node.status}</span>
                      <span className="opacity-80">{node.ping}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- PANEL 2: DOCUMENT INGESTION / UPLOAD --- */}
        {activeTab === "upload" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
            {/* Upload Area */}
            <div className="lg:col-span-1 space-y-6">
              <div className="border-2 border-dashed border-slate-800 bg-slate-900/20 rounded-3xl p-8 text-center hover:border-indigo-500/40 transition-all flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center mb-4 text-indigo-400 shadow-md">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-sm text-white mb-1">Drag & Drop Document</h3>
                <p className="text-slate-500 text-xs max-w-[200px] mb-6">
                  Supports PDF, PNG, JPG, JPEG, TXT, DOCX files up to 10MB.
                </p>
                <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs shadow-md transition-all cursor-pointer">
                  Browse Files
                  <input type="file" multiple onChange={handleFileChange} className="hidden" />
                </label>
              </div>

              {/* Upload Item Progress List */}
              {uploadFiles.length > 0 && (
                <div className="p-6 border border-slate-800 bg-slate-900/30 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Upload Queue ({uploadFiles.length})</h4>
                    <button 
                      onClick={triggerAllUploads}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-[10px] shadow-sm transition-all cursor-pointer"
                    >
                      Upload All
                    </button>
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {uploadFiles.map((item, idx) => (
                      <div key={idx} className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-2 relative">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <h5 className="text-xs font-semibold text-white truncate leading-none mb-1">{item.file.name}</h5>
                            <span className="text-[10px] text-slate-500">{(item.file.size / (1024 * 1024)).toFixed(2)} MB</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.status === "Queued" && (
                              <button 
                                onClick={() => triggerUpload(idx)} 
                                className="p-1 hover:bg-indigo-500/20 text-indigo-400 rounded cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button 
                              onClick={() => removeUploadItem(idx)} 
                              className="p-1 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Status tag */}
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`font-semibold ${item.status === "Success" ? "text-emerald-400" : item.status.startsWith("Error") ? "text-rose-400" : "text-slate-400"}`}>
                            {item.status}
                          </span>
                          {item.progress > 0 && <span>{item.progress}%</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ingested Documents History */}
            <div className="lg:col-span-2 p-6 border border-slate-800 bg-slate-900/30 rounded-2xl space-y-6">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-4">Processed Document Vault</h3>
              
              {isLoading ? (
                <div className="py-20 text-center text-slate-500 animate-pulse text-sm">Loading vaults...</div>
              ) : documents.length === 0 ? (
                <div className="py-24 text-center text-slate-500 text-sm">No documents found. Ingest files to start processing.</div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="p-4 bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between gap-4 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white leading-tight mb-1 truncate">{doc.filename}</h4>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                            <span className="bg-slate-800 px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px]">{doc.file_type}</span>
                            <span className="px-1.5 py-0.5 rounded border" style={{ color: CATEGORY_COLORS[doc.category], borderColor: `${CATEGORY_COLORS[doc.category]}30`, backgroundColor: `${CATEGORY_COLORS[doc.category]}08` }}>
                              {doc.category}
                            </span>
                            <span>Uploaded by: {doc.uploader_name}</span>
                            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Control Actions */}
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getBadgeColor(doc.status)}`}>
                          {doc.status}
                        </span>
                        
                        {doc.consensus_score !== null && (
                          <span className="text-xs font-bold text-slate-300">
                            {(doc.consensus_score * 100).toFixed(0)}%
                          </span>
                        )}

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => reprocessDoc(doc.id)}
                            title="Reprocess Document"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/15 transition-all cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteDoc(doc.id)}
                            title="Delete Permanently"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- PANEL 3: REVIEW QUEUE --- */}
        {activeTab === "review" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Split Screen Modal Backdrop */}
            {activeReviewId && reviewDoc ? (
              <div className="border border-slate-800 bg-slate-900/80 rounded-2xl overflow-hidden shadow-2xl relative">
                {/* Header Lock details */}
                <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-indigo-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white leading-none mb-1">{reviewDoc.filename}</h3>
                      <p className="text-[10px] text-slate-400">
                        Category: <span className="font-semibold text-indigo-400 uppercase">{reviewDoc.category}</span> | Extracted Score: <span className="font-bold text-white">{reviewDoc.consensus_score ? `${(reviewDoc.consensus_score * 100).toFixed(1)}%` : "N/A"}</span>
                      </p>
                    </div>
                  </div>
                  
                  {/* Status Banner */}
                  <div className="flex items-center gap-3">
                    {reviewLockError ? (
                      <span className="text-xs text-rose-400 font-semibold bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-xl">
                        View Only: {reviewLockError}
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> Locked by You
                      </span>
                    )}
                    <button 
                      onClick={closeReviewModal}
                      className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Main Split Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[500px]">
                  {/* Left Column: Raw OCR Text view */}
                  <div className="p-6 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/40 flex flex-col">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <FileDigit className="w-4 h-4" /> Original Document OCR Extracted Text
                    </h4>
                    <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-[11px] overflow-y-auto max-h-[450px] leading-relaxed whitespace-pre-wrap select-text selection:bg-indigo-500/30 selection:text-white">
                      {reviewDoc.ocr_text || "No text could be extracted."}
                    </div>
                  </div>

                  {/* Right Column: Editable Consensus Fields Form */}
                  <div className="p-6 flex flex-col justify-between bg-slate-900/20">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" /> Verify & Correct Extracted Fields
                      </h4>
                      
                      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                        {reviewDoc.fields.map((field) => (
                          <div 
                            key={field.id} 
                            className={`p-4 rounded-xl border flex flex-col gap-2 ${getFieldColor(field.confidence_score, field.validation_status)}`}
                          >
                            <div className="flex items-center justify-between gap-4 leading-none">
                              <span className="text-xs font-bold font-mono text-slate-800/80">{field.field_key}</span>
                              <span className="text-[10px] font-extrabold uppercase tracking-wide opacity-80">
                                Confidence: {(field.confidence_score * 100).toFixed(0)}%
                              </span>
                            </div>

                            {/* Editable Form Input */}
                            <input
                              type="text"
                              disabled={!!reviewLockError}
                              value={reviewDraft[field.field_key] || ""}
                              onChange={(e) => handleFieldChange(field.field_key, e.target.value)}
                              className="w-full px-3 py-2 bg-white/60 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all font-semibold"
                            />

                            {/* Verification Notes */}
                            {field.validation_notes && (
                              <p className="text-[9.5px] opacity-75 leading-tight flex items-start gap-1">
                                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>{field.validation_notes}</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="mt-6 pt-4 border-t border-slate-850 flex items-center justify-end gap-3">
                      <button
                        onClick={closeReviewModal}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      {!reviewLockError && (
                        <button
                          onClick={submitReview}
                          className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-teal-500 hover:from-indigo-600 hover:to-teal-600 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                        >
                          Approve and Commit Data
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Queue Table */
              <div className="p-6 border border-slate-800 bg-slate-900/30 rounded-2xl space-y-4">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-4">Pending Tasks Queue</h3>
                
                {isLoading ? (
                  <div className="py-20 text-center text-slate-500 animate-pulse text-sm">Loading queue...</div>
                ) : documents.length === 0 ? (
                  <div className="py-20 text-center text-slate-500 text-sm">
                    <CheckCircle className="w-12 h-12 text-emerald-500/20 mx-auto mb-3" />
                    No documents currently awaiting review. Queue is clear!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div 
                        key={doc.id}
                        onClick={() => openReviewModal(doc.id)}
                        className="p-4 bg-slate-950/60 border border-slate-850 hover:border-indigo-500/40 rounded-xl flex items-center justify-between gap-4 cursor-pointer transition-all hover:scale-[1.005]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center text-amber-400 shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white leading-tight mb-1 truncate">{doc.filename}</h4>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span className="bg-slate-800 px-1.5 py-0.5 rounded uppercase text-[9px]">{doc.file_type}</span>
                              <span className="text-amber-400 uppercase font-semibold">{doc.category}</span>
                              <span>Ingested: {new Date(doc.created_at).toLocaleDateString()}</span>
                              <span>•</span>
                              <span className="text-slate-500">{doc.uploader_name}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] block text-slate-500 leading-none mb-1">CONCORDANCE</span>
                            <span className="text-xs font-bold text-amber-400">
                              {doc.consensus_score ? `${(doc.consensus_score * 100).toFixed(0)}%` : "N/A"}
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- PANEL 4: SEARCH & RAG --- */}
        {activeTab === "search" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
            {/* Left Column: Filter and Results list */}
            <div className="lg:col-span-2 space-y-6">
              <form onSubmit={handleSearchSubmit} className="p-6 border border-slate-850 bg-slate-900/30 rounded-2xl space-y-4">
                <div className="flex items-center gap-4 flex-col sm:flex-row">
                  {/* Search query input */}
                  <div className="flex-1 relative w-full">
                    <Search className="absolute left-4 top-3 text-slate-500 w-4 h-4" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search filename, vendor, part numbers, or ask details..."
                      className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm transition-all font-medium"
                    />
                  </div>

                  {/* Search Type selector */}
                  <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 shrink-0 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setSearchType("metadata")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${searchType === "metadata" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      Structured SQL
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchType("semantic")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${searchType === "semantic" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      Semantic Vector
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  {/* Filter category */}
                  <select
                    value={searchCategory}
                    onChange={(e) => setSearchCategory(e.target.value)}
                    className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 focus:outline-none focus:border-indigo-500 text-xs transition-all font-semibold"
                  >
                    <option value="">All Categories</option>
                    <option value="INVOICE">Invoices</option>
                    <option value="RFQ">RFQs</option>
                    <option value="PURCHASE_ORDER">Purchase Orders</option>
                    <option value="CONTRACT">Contracts</option>
                    <option value="COMPLIANCE">Compliance Certificates</option>
                  </select>

                  <button
                    type="submit"
                    className="ml-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                  >
                    Run Query
                  </button>
                </div>
              </form>

              {/* Search Results list */}
              <div className="p-6 border border-slate-800 bg-slate-900/30 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Search Results ({searchResults.length})</h3>
                  {searchResults.length > 0 && (
                    <button
                      onClick={selectAllSearchResultsForRag}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                    >
                      Select All for RAG Context
                    </button>
                  )}
                </div>

                {isLoading ? (
                  <div className="py-20 text-center text-slate-500 animate-pulse text-sm">Searching index...</div>
                ) : searchResults.length === 0 ? (
                  <div className="py-20 text-center text-slate-500 text-sm">
                    No results matched your query criteria. Change search query.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {searchResults.map((res, i) => {
                      const docId = res.id || res.document_id;
                      const isSelected = selectedDocsForRag.includes(docId);
                      return (
                        <div 
                          key={i} 
                          className={`p-4 bg-slate-950/60 border rounded-xl flex items-start gap-4 transition-all ${
                            isSelected ? "border-indigo-500/50 bg-indigo-500/5" : "border-slate-800"
                          }`}
                        >
                          {/* Checkbox selector for RAG */}
                          <button
                            onClick={() => toggleDocForRag(docId)}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-1 cursor-pointer transition-all ${
                              isSelected ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-700 text-transparent"
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-xs font-bold text-white truncate">{res.filename || res.name || "Document"}</h4>
                              <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-semibold uppercase shrink-0">
                                {res.category || "UNKNOWN"}
                              </span>
                            </div>

                            {/* Snippet text for semantic search results */}
                            {res.text && (
                              <p className="text-[11px] text-slate-400 font-mono bg-slate-900/60 p-2 border border-slate-850 rounded-lg max-h-20 overflow-y-auto mb-2 whitespace-pre-wrap leading-relaxed select-text">
                                ...{res.text}...
                              </p>
                            )}
                            
                            {res.distance !== undefined && (
                              <span className="text-[10px] text-teal-400 font-semibold">Semantic Match Dist: {res.distance.toFixed(4)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: RAG Conversational Chatbot sidebar */}
            <div className="lg:col-span-1 p-6 border border-slate-800 bg-slate-900/30 rounded-2xl flex flex-col justify-between min-h-[500px]">
              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Cognitive RAG Assistant</h3>
                </div>

                {/* Selected context indicators */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-[10px] block text-slate-500 font-bold uppercase mb-1">Active context documents</span>
                  {selectedDocsForRag.length === 0 ? (
                    <span className="text-xs text-amber-500/80 leading-none">Select documents from the search list to ask questions.</span>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-white font-bold bg-indigo-600/10 border border-indigo-500/30 px-2 py-0.5 rounded-lg">
                        {selectedDocsForRag.length} Selected
                      </span>
                      <button 
                        onClick={() => setSelectedDocsForRag([])}
                        className="text-[10px] text-slate-500 hover:text-slate-300 font-semibold underline cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>

                {/* Chat window */}
                <div className="h-72 border border-slate-850 bg-slate-950/60 rounded-xl p-4 overflow-y-auto space-y-3 text-xs leading-relaxed max-h-[300px]">
                  {ragChat.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 space-y-2">
                      <HelpCircle className="w-8 h-8 opacity-20" />
                      <p>Ask a question like:<br/>"Find all RFQs containing PN-BRK-9902"</p>
                    </div>
                  ) : (
                    ragChat.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                        <div className={`p-3 rounded-2xl max-w-[85%] ${
                          msg.role === "user" 
                            ? "bg-indigo-600 text-white rounded-tr-none" 
                            : "bg-slate-900 border border-slate-800 text-slate-300 rounded-tl-none font-medium"
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                  {isRagLoading && (
                    <div className="flex items-center gap-2 text-slate-500 animate-pulse font-semibold">
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>Synthesizing cognitive consensus response...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Input form */}
              <form onSubmit={triggerRagChat} className="mt-4 flex gap-2">
                <input
                  type="text"
                  disabled={selectedDocsForRag.length === 0 || isRagLoading}
                  value={ragQuestion}
                  onChange={(e) => setRagQuestion(e.target.value)}
                  placeholder={selectedDocsForRag.length === 0 ? "Select context docs first..." : "Ask questions..."}
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs white focus:outline-none focus:border-indigo-500 text-slate-300"
                />
                <button
                  type="submit"
                  disabled={selectedDocsForRag.length === 0 || isRagLoading || !ragQuestion.trim()}
                  className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 text-white rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* --- PANEL 5: AUDIT LOGS --- */}
        {activeTab === "audit" && (
          <div className="p-6 border border-slate-800 bg-slate-900/30 rounded-2xl space-y-6 animate-fadeIn">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-4">Immutability Operations Ledger</h3>

            {isLoading ? (
              <div className="py-20 text-center text-slate-500 animate-pulse text-sm">Fetching ledger feeds...</div>
            ) : auditLogs.length === 0 ? (
              <div className="py-20 text-center text-slate-500 text-sm">No operation logs recorded. Perform actions to seed ledger.</div>
            ) : (
              <div className="relative border-l border-slate-850 pl-6 space-y-6 max-h-[600px] overflow-y-auto pr-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="relative group">
                    {/* Circle timeline pin */}
                    <span className="absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-850 border border-slate-700 group-hover:bg-indigo-500 group-hover:border-indigo-400 transition-all"></span>

                    <div className="p-4 bg-slate-950/60 border border-slate-850 rounded-xl space-y-2 select-text">
                      <div className="flex items-center justify-between gap-4 flex-wrap leading-none">
                        <span className="text-xs font-bold text-slate-200">{log.action}</span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 leading-tight">
                        <span className="font-semibold text-slate-300">Operator:</span> {log.operator} | <span className="font-semibold text-slate-300">File:</span> {log.filename}
                      </div>

                      {/* Diff log details formatting */}
                      {log.details && (
                        <div className="text-[10px] font-mono bg-slate-900 border border-slate-855 p-3 rounded-lg text-slate-400 space-y-1">
                          {log.details.corrections ? (
                            <div>
                              <div className="font-semibold text-indigo-400 mb-1">Human Field Corrections Diff:</div>
                              {Object.entries(log.details.corrections).map(([field, diff]: [string, any], idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1">
                                  <span className="text-slate-300 font-bold">{field}:</span>
                                  <span className="text-rose-400 line-through">"{diff.before}"</span>
                                  <span className="text-slate-500">→</span>
                                  <span className="text-emerald-400 font-bold">"{diff.after}"</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <pre className="whitespace-pre-wrap leading-normal">{JSON.stringify(log.details, null, 2)}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
