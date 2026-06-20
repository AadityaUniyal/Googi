const API_BASE_URL = "http://localhost:8000";

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

export interface ExtractedField {
  id: string;
  field_key: string;
  extracted_value: string | null;
  critic_score: number;
  auditor_score: number;
  consensus_value: string | null;
  confidence_score: number;
  is_modified: boolean;
  validation_status: "VALID" | "FLAGGED" | "MANUAL_CORRECTION";
  validation_notes: string | null;
}

export interface DocumentResponse {
  id: string;
  filename: string;
  file_type: string;
  category: "INVOICE" | "RFQ" | "PURCHASE_ORDER" | "CONTRACT" | "COMPLIANCE" | "UNKNOWN";
  status: "INGESTED" | "PROCESSING" | "FAILED" | "AWAITING_REVIEW" | "PROCESSED";
  ocr_text: string | null;
  consensus_score: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  fields: ExtractedField[];
}

export interface DocumentSimpleResponse {
  id: string;
  filename: string;
  file_type: string;
  category: string;
  status: string;
  consensus_score: number | null;
  created_at: string;
  uploader_name: string;
}

export interface KPIMetrics {
  total_documents: number;
  processed_documents: number;
  pending_review: number;
  failed_documents: number;
  average_accuracy: number;
  human_review_rate: number;
  average_processing_time_seconds: number;
}

export interface ChartData {
  category_distribution: { category: string; count: number }[];
  status_distribution: { status: string; count: number }[];
  daily_trends: { date: string; count: number }[];
}

export interface AuditLogResponse {
  id: string;
  document_id: string | null;
  filename: string;
  operator: string;
  action: string;
  details: any;
  timestamp: string;
}

// Request wrapper helper
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("doc_intel_token");
  
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem("doc_intel_token");
    window.location.reload();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || `HTTP error! status: ${response.status}`);
  }

  if (response.status === 244 || response.status === 204) {
    return null as any;
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Authentication
  login: async (email: string, password: string): Promise<{ access_token: string; token_type: string }> => {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  register: async (email: string, password: string, fullName: string, role: string): Promise<UserResponse> => {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: fullName, role }),
    });
  },

  getMe: async (): Promise<UserResponse> => {
    return request("/api/auth/me");
  },

  // Documents
  uploadDocument: async (file: File): Promise<DocumentResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/documents/upload", {
      method: "POST",
      body: formData,
    });
  },

  listDocuments: async (category?: string, status?: string): Promise<DocumentSimpleResponse[]> => {
    let url = "/api/documents";
    const params = new URLSearchParams();
    if (category) params.append("category", category);
    if (status) params.append("status", status);
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    return request(url);
  },

  getDocument: async (id: string): Promise<DocumentResponse> => {
    return request(`/api/documents/${id}`);
  },

  reprocessDocument: async (id: string): Promise<DocumentResponse> => {
    return request(`/api/documents/${id}/reprocess`, {
      method: "POST",
    });
  },

  deleteDocument: async (id: string): Promise<void> => {
    return request(`/api/documents/${id}`, {
      method: "DELETE",
    });
  },

  // Review
  getReviewQueue: async (): Promise<DocumentSimpleResponse[]> => {
    return request("/api/review/queue");
  },

  lockDocument: async (id: string): Promise<{ message: string; locked_by: string }> => {
    return request(`/api/review/${id}/lock`, {
      method: "POST",
    });
  },

  unlockDocument: async (id: string): Promise<{ message: string }> => {
    return request(`/api/review/${id}/unlock`, {
      method: "POST",
    });
  },

  submitReview: async (id: string, updates: { field_key: string; consensus_value: string }[]): Promise<DocumentResponse> => {
    return request(`/api/review/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ updates }),
    });
  },

  // Search
  searchMetadata: async (query?: string, category?: string, status?: string, minScore?: number): Promise<DocumentSimpleResponse[]> => {
    let url = "/api/search";
    const params = new URLSearchParams();
    if (query) params.append("query", query);
    if (category) params.append("category", category);
    if (status) params.append("status", status);
    if (minScore !== undefined) params.append("min_score", minScore.toString());
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    return request(url);
  },

  searchSemantic: async (query: string, category?: string, nResults: number = 5): Promise<any[]> => {
    return request("/api/search/semantic", {
      method: "POST",
      body: JSON.stringify({ query, category, n_results: nResults }),
    });
  },

  askRagChat: async (documentIds: string[], question: string): Promise<{ answer: string }> => {
    return request("/api/search/rag", {
      method: "POST",
      body: JSON.stringify({ document_ids: documentIds, question }),
    });
  },

  // Analytics
  getKpis: async (): Promise<KPIMetrics> => {
    return request("/api/analytics/kpis");
  },

  getCharts: async (): Promise<ChartData> => {
    return request("/api/analytics/charts");
  },

  getAuditLogs: async (limit: number = 50): Promise<AuditLogResponse[]> => {
    return request(`/api/analytics/audit-logs?limit=${limit}`);
  }
};
