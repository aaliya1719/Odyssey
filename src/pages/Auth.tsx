import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Auth() {
  const { isAuthenticated, loading: authLoading, signInWithOtp, signInWithGoogle } = useAuth();
  const [email,        setEmail]        = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);

  // Detect whether the page was opened via a magic-link callback.
  // In that case the URL will contain a hash with access_token (implicit flow)
  // or a ?code= query param (PKCE flow). Show a loading spinner while the
  // supabase-js client exchanges the token and fires SIGNED_IN.
  const callbackError = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('error_description') ||
      new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error_description')
    : null;

  const isCallback = typeof window !== 'undefined' && !callbackError && (
    window.location.hash.includes('access_token') ||
    new URLSearchParams(window.location.search).has('code')
  );

  // Already authenticated — go straight to the app.
  if (!authLoading && isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  if (callbackError) {
    return (
      <div className="flex justify-center items-start pt-16 pb-24 px-4">
        <div className="w-full max-w-md rounded-xl p-8 text-center" style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}>
          <p className="text-sm" style={{ color: '#E07070' }}>{callbackError}</p>
          <a href="/auth" className="inline-block mt-5 text-sm underline underline-offset-2" style={{ color: 'var(--color-app-mission)' }}>
            Return to sign in
          </a>
        </div>
      </div>
    );
  }

  // Still resolving the session (initial load or mid-callback exchange).
  if (authLoading || isCallback) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--color-app-mission)', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
            {isCallback ? 'Signing you in…' : 'Loading…'}
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await signInWithOtp(email.trim());
      setSuccess(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to send magic link. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to sign in with Google. Please try again.'
      );
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center items-start pt-16 pb-24 px-4">
      <div
        className="w-full max-w-md rounded-xl p-8"
        style={{
          backgroundColor: 'var(--color-app-surface)',
          border: '1px solid var(--color-app-border)',
        }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <p
            className="text-xs font-semibold tracking-[0.2em] uppercase mb-3"
            style={{ color: 'var(--color-app-mission)' }}
          >
            Authentication
          </p>
          <h1
            className="font-display text-3xl mb-2"
            style={{ color: 'var(--color-app-text)' }}
          >
            Begin Your Odyssey
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
            Enter your email to receive a passwordless magic link.
          </p>
        </div>

        {success ? (
          <div
            className="rounded-xl p-6 text-center"
            style={{
              backgroundColor: 'rgba(184,122,85,0.06)',
              border: '1px solid rgba(184,122,85,0.2)',
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'rgba(184,122,85,0.12)' }}
            >
              <svg
                className="w-6 h-6"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                style={{ color: 'var(--color-app-mission)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1" style={{ color: 'var(--color-app-text)' }}>
              Check your inbox
            </h3>
            <p className="text-sm mb-5" style={{ color: 'var(--color-app-text-muted)' }}>
              We sent a magic link to{' '}
              <strong style={{ color: 'var(--color-app-text)' }}>{email}</strong>.
              Click it to sign in.
            </p>
            <button
              onClick={() => { setSuccess(false); setEmail(''); }}
              className="text-xs font-medium cursor-pointer bg-transparent border-none underline underline-offset-2"
              style={{ color: 'var(--color-app-mission)' }}
            >
              Use a different email address
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                className="rounded-lg p-3 text-sm"
                style={{
                  backgroundColor: 'rgba(168,59,59,0.1)',
                  border: '1px solid rgba(168,59,59,0.25)',
                  color: '#E07070',
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--color-app-text-muted)' }}
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isSubmitting}
                className="app-input w-full"
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isGoogleSubmitting || !email.trim()}
              className="w-full py-3 px-4 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer border-none disabled:opacity-50 disabled:pointer-events-none"
              style={{ backgroundColor: 'var(--color-app-mission)', color: '#fff' }}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                'Send Magic Link'
              )}
            </button>

            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-app-border)' }} />
              <span className="text-xs" style={{ color: 'var(--color-app-text-dim)' }}>or</span>
              <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-app-border)' }} />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting || isGoogleSubmitting}
              className="w-full py-3 px-4 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer border disabled:opacity-50 disabled:pointer-events-none"
              style={{
                backgroundColor: 'var(--color-app-surface)',
                borderColor: 'var(--color-app-border)',
                color: 'var(--color-app-text)',
              }}
            >
              {isGoogleSubmitting ? (
                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--color-app-mission)', borderTopColor: 'transparent' }} />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M21.35 12.23c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.26Z" />
                  <path fill="#34A853" d="M12 21.67c2.63 0 4.84-.87 6.46-2.36l-3.14-2.45c-.87.58-1.98.92-3.32.92-2.55 0-4.71-1.72-5.49-4.03H3.27v2.53A9.75 9.75 0 0 0 12 21.67Z" />
                  <path fill="#FBBC05" d="M6.51 13.75A5.86 5.86 0 0 1 6.2 12c0-.61.11-1.2.31-1.75V7.72H3.27A9.76 9.76 0 0 0 2.25 12c0 1.57.38 3.06 1.02 4.28l3.24-2.53Z" />
                  <path fill="#EA4335" d="M12 6.22c1.43 0 2.71.49 3.73 1.46l2.8-2.8C16.84 3.3 14.63 2.33 12 2.33a9.75 9.75 0 0 0-8.73 5.39l3.24 2.53c.78-2.31 2.94-4.03 5.49-4.03Z" />
                </svg>
              )}
              <span>{isGoogleSubmitting ? 'Redirecting…' : 'Continue with Google'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
