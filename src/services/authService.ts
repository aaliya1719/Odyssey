import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export const authService = {
  /**
   * Send a magic link / OTP email for passwordless sign-in.
   *
   * emailRedirectTo points to the app root so the supabase-js client can
   * exchange the token on ANY page load — not just /auth. The client's
   * detectSessionInUrl + autoInitialize handles the exchange automatically,
   * then onAuthStateChange fires SIGNED_IN regardless of which page the
   * user lands on. Pointing to root (rather than /auth) also avoids a
   * redirect-URL mismatch if the user opens the link from a different
   * browser/device where the tab isn't sitting on /auth.
   */
  async signInWithOtp(email: string) {
    const redirectTo = typeof window !== 'undefined'
      ? window.location.origin          // e.g. http://localhost:5173
      : undefined;

    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        // shouldCreateUser: true is the default — new accounts are created
        // automatically on first magic-link sign-in.
      },
    });
    if (error) throw error;
    return data;
  },

  /**
   * Verify a 6-digit OTP token (fallback for token-based verification).
   */
  async verifyOtp(email: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) throw error;
    return data;
  },

  /**
   * Sign out the current user session.
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Return the current persisted session (null if none).
   * Safe to call on every page load — supabase-js reads from localStorage.
   */
  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  /**
   * Return the current authenticated user (server-verified).
   */
  async getUser(): Promise<User | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  },

  /**
   * Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED…).
   * Returns the subscription object — call .unsubscribe() on cleanup.
   */
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => callback(event, session)
    );
    return subscription;
  },
};
