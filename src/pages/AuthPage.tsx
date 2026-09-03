import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import PrivacyPolicy from './Legal/PrivacyPolicy';
import TermsOfService from './Legal/TermsOfService';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AuthPage: React.FC = () => {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTOS, setShowTOS] = useState(false);

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const validate = (): boolean => {
    if (!email || !password) {
      setError('Email and password are required.');
      return false;
    }
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return false;
    }
    return true;
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!online) {
      setError('You are offline — sign in/up requires network access.');
      return;
    }
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await signInWithEmail(email, password);
        if (err) setError(err.message || 'Sign in failed');
      } else {
        const { error: err } = await signUpWithEmail(email, password);
        if (err) setError(err.message || 'Sign up failed');
      }
    } catch (e: any) {
      setError(e?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    if (!online) return setError('You are offline — cannot start OAuth.');
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e?.message || 'Google sign-in failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-auto text-slate-100">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-brand-text">Welcome Back</h2>
          <p className="mt-1 text-sm text-brand-muted">Organize your tasks seamlessly, online or offline.</p>
        </div>

        <div className="mt-5 grid grid-cols-2 bg-slate-950 p-1 rounded-full mb-6">
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${mode === 'signin' ? 'bg-brand-accent text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
            onClick={() => setMode('signin')}
          >
            Login
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${mode === 'signup' ? 'bg-brand-accent text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
            onClick={() => setMode('signup')}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-200 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form className="mt-4" onSubmit={submit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white outline-none mb-3"
            placeholder="you@example.com"
            required
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white outline-none mb-3"
            placeholder="••••••••"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="btn-rounded w-full disabled:opacity-60"
          >
            {loading ? 'Working...' : mode === 'signin' ? 'Sign In' : 'Create account'}
          </button>
        </form>

        <div className="mt-4 flex items-center">
          <div className="flex-1 border-t border-slate-700" />
          <div className="px-3 text-[11px] uppercase tracking-wide text-slate-400">or</div>
          <div className="flex-1 border-t border-slate-700" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          className="btn-rounded-secondary w-full mt-4"
        >
          <svg className="w-4 h-4 object-contain flex-shrink-0" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <g>
              <path fill="#4285F4" d="M533.5 278.4c0-18.1-1.6-35.5-4.6-52.4H272v99.2h147.4c-6.3 34-25.3 62.8-54 82l87.3 67c51-47 80.8-116.3 80.8-196.0z"/>
              <path fill="#34A853" d="M272 544.3c73.5 0 135.3-24.3 180.4-66.0l-87.3-67c-24.3 16.3-55.6 25.8-93.1 25.8-71.5 0-132-48.3-153.6-113.3L25.9 361.9C68.6 468.5 163.8 544.3 272 544.3z"/>
              <path fill="#FBBC05" d="M118.4 327.1c-9.8-29.4-9.8-61.1 0-90.5L25.9 161.9C-6.6 220.9-6.6 323.3 25.9 382.3l92.5-55.2z"/>
              <path fill="#EA4335" d="M272 107.7c39.9 0 75.8 13.7 104.1 40.6l78.1-78.1C406.9 24.3 345.1 0 272 0 163.8 0 68.6 75.8 25.9 183.5l92.5 55.2C140 156 200.5 107.7 272 107.7z"/>
            </g>
          </svg>
          <span>Sign in with Google</span>
        </button>

        <div className="mt-4 text-center text-[11px] text-slate-400">
          By continuing you agree to our{' '}
          <button type="button" className="text-blue-400 hover:text-blue-300 underline" onClick={() => setShowTOS(true)}>
            Terms of Service
          </button>{' '}
          and{' '}
          <button type="button" className="text-blue-400 hover:text-blue-300 underline" onClick={() => setShowPrivacy(true)}>
            Privacy Policy
          </button>
          .
        </div>
      </div>

      {showPrivacy && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl p-6 overflow-auto max-h-[80vh]">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold text-brand-text">Privacy Policy</h3>
              <button type="button" className="text-slate-300" onClick={() => setShowPrivacy(false)}>Close</button>
            </div>
            <div className="mt-4">
              <PrivacyPolicy />
            </div>
          </div>
        </div>
      )}

      {showTOS && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl p-6 overflow-auto max-h-[80vh]">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold text-brand-text">Terms of Service</h3>
              <button type="button" className="text-slate-300" onClick={() => setShowTOS(false)}>Close</button>
            </div>
            <div className="mt-4">
              <TermsOfService />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthPage;
