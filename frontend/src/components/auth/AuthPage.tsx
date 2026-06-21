'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export const AuthPage: React.FC = () => {
  const { login, register } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('VIEWER');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
        toast.success('Logged in successfully!');
      } else {
        if (!name) {
          toast.error('Please enter your full name');
          setIsLoading(false);
          return;
        }
        await register(email, password, name, role);
        toast.success('Registration complete! Please log in.');
        setIsLogin(true);
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen w-screen bg-[#080808] overflow-hidden p-4">
      {/* Background Animated Glows */}
      <div className="absolute top-[20%] left-[25%] -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-primary/10 blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[20%] right-[25%] translate-x-1/2 translate-y-1/2 w-[350px] h-[350px] rounded-full bg-accent/10 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md z-10"
      >
        <div className="glass-card border border-white/[0.06] p-8 bg-[#0c0c0c]/80 flex flex-col gap-6 shadow-2xl relative">
          
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-2 mt-2">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-tr from-primary to-accent text-white shadow-lg shadow-primary/20 mb-1">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground font-sans">
              {isLogin ? 'Welcome to DocIntel' : 'Create an Account'}
            </h2>
            <p className="text-xs text-muted-foreground max-w-xs font-sans">
              {isLogin 
                ? 'Sign in to access the Distributed AI Document Intelligence Platform' 
                : 'Join the platform and start processing documents with AI agents'
              }
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            {!isLogin && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-[#111111] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors duration-200"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#111111] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors duration-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#111111] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors duration-200"
              />
            </div>

            {!isLogin && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono">Platform Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-[#111111] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors duration-200"
                >
                  <option value="VIEWER">Viewer (Read-only)</option>
                  <option value="OPERATOR">Operator (Upload & Search)</option>
                  <option value="REVIEWER">Reviewer (Manual Field Verification)</option>
                  <option value="ADMIN">Admin (All privileges)</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={clsx(
                'group flex items-center justify-center gap-2 mt-2 w-full py-2.5 rounded-xl text-sm font-semibold border text-white transition-all duration-300 shadow-md cursor-pointer',
                isLoading 
                  ? 'bg-primary/50 border-primary/30 cursor-not-allowed'
                  : 'bg-primary border-primary/20 hover:bg-primary-hover shadow-primary/10'
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {/* Switch link */}
          <div className="text-center mt-2 select-none">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-200 font-sans"
            >
              {isLogin 
                ? "Don't have an account? Sign up" 
                : 'Already have an account? Sign in'
              }
            </button>
          </div>

        </div>
      </motion.div>
    </div>
  );
};
export default AuthPage;
