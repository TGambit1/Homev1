import { useState } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface LoginProps {
  onLogin: (sessionToken: string, userId: string, user: any) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [email1, setEmail1] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [person1Name, setPerson1Name] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setLoading(true);

    try {
      if (resetMode) {
        if (!resetEmail) {
          setError('Email is required');
          setLoading(false);
          return;
        }

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/forgot-password`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
            },
            body: JSON.stringify({ email: resetEmail }),
          }
        );

        const data = await response.json();
        if (response.ok && data.success) {
          setResetMessage(`A reset link has been sent to ${resetEmail}.`);
          setResetMode(false);
          setResetEmail('');
        } else {
          setError(data.error || 'Unable to start password reset. Please try again.');
        }
        return;
      }

      const endpoint = isLogin ? 'login' : 'register';
      let body: any;

      if (isLogin) {
        body = { email, password };
      } else {
        if (!email1) {
          setError('Your email is required');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }
        body = {
          email1,
          password,
          person1Name: person1Name || 'Partner 1',
        };
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify(body)
        }
      );

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('sessionToken', data.sessionToken);
        localStorage.setItem('userId', data.user.userId);
        localStorage.setItem('primaryEmail', data.user.primaryEmail || data.user.email);
        if (data.user.secondaryEmail) {
          localStorage.setItem('secondaryEmail', data.user.secondaryEmail);
        } else {
          localStorage.removeItem('secondaryEmail');
        }
        if (data.user.loggedInEmail) {
          localStorage.setItem('loggedInEmail', data.user.loggedInEmail);
        } else if (data.user.primaryEmail) {
          localStorage.setItem('loggedInEmail', data.user.primaryEmail);
        }
        localStorage.setItem('person1Name', data.user.person1Name);
        localStorage.setItem('person2Name', data.user.person2Name);
        onLogin(data.sessionToken, data.user.userId, data.user);
      } else {
        if (data.email1Exists || data.email2Exists) {
          setError(
            data.email1Exists && data.email2Exists
              ? 'Those emails are already registered'
              : 'This email is already registered',
          );
        } else {
          setError(data.error || 'Authentication failed');
        }
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-lg text-sm bg-[#1a1a30] border border-white/10 text-[#f0ebe3] placeholder-[#5a5a78] focus:outline-none focus:border-[#c9a76c] focus:ring-1 focus:ring-[#c9a76c] transition-colors';

  const labelClass = 'block text-xs font-medium tracking-widest uppercase text-[#8a8aaa] mb-2';

  return (
    <div className="min-h-screen flex" style={{ background: '#0b0b16', fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Left brand panel ── */}
      <div
        className="hidden lg:flex lg:w-3/5 flex-col justify-between p-16 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f0f1e 0%, #0b0b16 60%, #12102a 100%)' }}
      >
        {/* Subtle radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 30% 70%, rgba(201,167,108,0.07) 0%, transparent 70%)'
          }}
        />

        {/* Top nav bar */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
              style={{ background: '#c9a76c', color: '#0b0b16', fontFamily: "'DM Serif Display', serif" }}
            >
              H
            </div>
            <span className="text-sm font-medium tracking-widest uppercase text-[#8a8aaa]">
              Homebase
            </span>
          </div>
          <nav className="flex items-center gap-8">
            {['Mission', 'Our Story', 'Events'].map(item => (
              <a
                key={item}
                href="#"
                className="text-xs tracking-widest uppercase text-[#8a8aaa] hover:text-[#c9a76c] transition-colors"
              >
                {item}
              </a>
            ))}
          </nav>
        </div>

        {/* Hero content */}
        <div className="relative z-10">
          <p
            className="text-xs tracking-widest uppercase mb-8"
            style={{ color: '#c9a76c' }}
          >
            ✦ &nbsp;Intelligence Platform for Couples
          </p>
          <h1
            className="text-6xl xl:text-7xl leading-none mb-8"
            style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              color: '#f0ebe3',
              fontWeight: 400,
            }}
          >
            A Life<br />
            <em style={{ color: '#c9a76c', fontStyle: 'italic' }}>Designed</em><br />
            Together.
          </h1>
          <p className="text-base leading-relaxed max-w-md" style={{ color: '#8a8aaa' }}>
            The private platform for couples to align on money, memories, and everything in between.
          </p>
        </div>

        {/* Bottom stats */}
        <div className="relative z-10 flex items-center gap-12">
          {[
            { value: 'Private', label: 'Members Only' },
            { value: 'AI', label: 'Powered Assistant' },
            { value: 'Secure', label: 'End-to-End' },
          ].map(stat => (
            <div key={stat.label}>
              <p
                className="text-lg font-semibold mb-0.5"
                style={{ fontFamily: "'DM Serif Display', serif", color: '#c9a76c' }}
              >
                {stat.value}
              </p>
              <p className="text-xs tracking-widest uppercase" style={{ color: '#5a5a78' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Decorative line */}
        <div
          className="absolute bottom-0 left-16 right-16 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(201,167,108,0.3), transparent)' }}
        />
      </div>

      {/* ── Right form panel ── */}
      <div
        className="flex-1 lg:w-2/5 flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-16"
        style={{ background: '#0f0f1e' }}
      >
        {/* Mobile logo */}
        <div className="flex items-center gap-3 mb-12 lg:hidden">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
            style={{ background: '#c9a76c', color: '#0b0b16', fontFamily: "'DM Serif Display', serif" }}
          >
            H
          </div>
          <span className="text-sm font-medium tracking-widest uppercase text-[#8a8aaa]">
            Homebase
          </span>
        </div>

        <div className="max-w-sm w-full mx-auto">
          <div className="mb-10">
            <h2
              className="text-3xl mb-2"
              style={{ fontFamily: "'DM Serif Display', serif", color: '#f0ebe3', fontWeight: 400 }}
            >
              {resetMode ? 'Reset password' : isLogin ? 'Welcome back.' : 'Create account.'}
            </h2>
            <p className="text-sm" style={{ color: '#8a8aaa' }}>
              {resetMode
                ? "Enter your email and we'll send a reset link."
                : isLogin
                  ? "Sign in to your Homebase account."
                  : "Start building your life together."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {resetMode ? (
              <div>
                <label className={labelClass}>Email address</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>
            ) : isLogin ? (
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="you@example.com"
                />
                <p className="mt-1.5 text-xs" style={{ color: '#5a5a78' }}>
                  Either partner's email works
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass}>Your email</label>
                  <input
                    type="email"
                    value={email1}
                    onChange={(e) => setEmail1(e.target.value)}
                    required
                    autoComplete="email"
                    className={inputClass}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className={labelClass}>Your name (optional)</label>
                  <input
                    type="text"
                    value={person1Name}
                    onChange={(e) => setPerson1Name(e.target.value)}
                    placeholder="First name"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {!resetMode && (
              <div>
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={inputClass}
                  placeholder="••••••••"
                />
                {!isLogin && (
                  <p className="mt-1.5 text-xs" style={{ color: '#5a5a78' }}>
                    Min. 6 characters
                  </p>
                )}
              </div>
            )}

            {!isLogin && !resetMode && (
              <div>
                <label className={labelClass}>Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className={`${inputClass} ${
                    confirmPassword && password !== confirmPassword
                      ? 'border-[#e05c5c] focus:border-[#e05c5c] focus:ring-[#e05c5c]'
                      : ''
                  }`}
                  placeholder="••••••••"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1.5 text-xs text-[#e05c5c]">Passwords do not match</p>
                )}
              </div>
            )}

            {error && (
              <div
                className="text-sm px-4 py-3 rounded-lg border"
                style={{ background: 'rgba(224,92,92,0.1)', borderColor: 'rgba(224,92,92,0.3)', color: '#e07575' }}
              >
                {error}
              </div>
            )}

            {resetMessage && (
              <div
                className="text-sm px-4 py-3 rounded-lg border"
                style={{ background: 'rgba(201,167,108,0.1)', borderColor: 'rgba(201,167,108,0.3)', color: '#c9a76c' }}
              >
                {resetMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-lg text-sm font-semibold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
              style={{ background: '#c9a76c', color: '#0b0b16', fontFamily: "'DM Sans', sans-serif" }}
            >
              {loading
                ? 'Please wait…'
                : resetMode
                  ? 'Send reset link'
                  : isLogin
                    ? 'Sign in'
                    : 'Create account'}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-8 space-y-3 text-center">
            <button
              onClick={() => {
                if (resetMode) {
                  setResetMode(false);
                  setResetEmail('');
                  setResetMessage('');
                  setError('');
                  return;
                }
                setIsLogin(!isLogin);
                setError('');
                setPassword('');
                setConfirmPassword('');
                setEmail('');
                setEmail1('');
              }}
              className="text-sm transition-colors hover:text-[#c9a76c]"
              style={{ color: '#8a8aaa' }}
            >
              {resetMode
                ? '← Back to sign in'
                : isLogin
                  ? "Don't have an account? \u00A0Sign up"
                  : 'Already have an account? \u00A0Sign in'}
            </button>

            {isLogin && !resetMode && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setResetMode(true);
                    setError('');
                    setResetMessage('');
                  }}
                  className="text-xs transition-colors hover:text-[#c9a76c]"
                  style={{ color: '#5a5a78' }}
                >
                  Forgot your password?
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="mt-12 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-center text-xs" style={{ color: '#3a3a58' }}>
              © The Social Company of the United States
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
