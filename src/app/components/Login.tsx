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
          setResetMessage(`A reset link has been sent to ${resetEmail}. Check your inbox (and spam).`);
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
        // Login: use single email field
        body = { email, password };
      } else {
        if (!email1) {
          setError('Your email is required');
          setLoading(false);
          return;
        }

        // Validate password confirmation
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
        // Store session token in localStorage
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
        // Handle specific error messages
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Homebase</h1>
          <p className="text-gray-600">Your personal assistant for couples</p>
        </div>
        
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {isLogin && resetMode ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reset password
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Enter your email and we&apos;ll send you a link to reset your password.
                </p>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="you@example.com"
                />
              </div>
            </>
          ) : isLogin ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (Either Partner's Email)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="you@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">You can log in with either partner's email</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your email
                </label>
                <input
                  type="email"
                  value={email1}
                  onChange={(e) => setEmail1(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="you@example.com"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
            {!isLogin && (
              <p className="text-xs text-gray-500 mt-1">
                You&apos;ll share this password with your partner when they join (min. 6 characters)
              </p>
            )}
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  confirmPassword && password !== confirmPassword
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-gray-300'
                }`}
                placeholder="••••••••"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
              )}
            </div>
          )}

          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your name (optional)
                </label>
                <input
                  type="text"
                  value={person1Name}
                  onChange={(e) => setPerson1Name(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          {resetMessage && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-3 rounded-md">
              <p>{resetMessage}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading
              ? 'Loading...'
              : resetMode
                ? 'Send reset link'
                : isLogin
                  ? 'Login'
                  : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
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
            className="text-sm text-blue-600 hover:underline"
          >
            {resetMode
              ? 'Back to login'
              : isLogin
                ? "Don't have an account? Sign up"
                : 'Already have an account? Login'}
          </button>
          {isLogin && !resetMode && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  setResetMode(true);
                  setError('');
                  setResetMessage('');
                }}
                className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
              >
                Forgot your password?
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
