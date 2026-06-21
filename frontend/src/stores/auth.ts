import { create } from 'zustand'
import { api } from '@/lib/api'

interface User {
  id: string
  email: string
  full_name: string
  role: string
  created_at: string
}

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, role: string) => Promise<void>
  logout: () => void
  loadUser: () => Promise<void>
  setToken: (token: string) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('doc_intel_token') : null,
  user: null,
  isLoading: false,

  setToken: (token: string) => {
    localStorage.setItem('doc_intel_token', token)
    set({ token })
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await api.login(email, password)
      localStorage.setItem('doc_intel_token', res.access_token)
      set({ token: res.access_token })
      await get().loadUser()
    } finally {
      set({ isLoading: false })
    }
  },

  register: async (email: string, password: string, name: string, role: string) => {
    set({ isLoading: true })
    try {
      await api.register(email, password, name, role)
    } finally {
      set({ isLoading: false })
    }
  },

  logout: () => {
    localStorage.removeItem('doc_intel_token')
    set({ token: null, user: null })
  },

  loadUser: async () => {
    try {
      const user = await api.getMe()
      set({ user })
    } catch {
      get().logout()
    }
  },
}))
