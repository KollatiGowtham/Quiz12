import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { supabase, USE_SUPABASE } from "@/lib/supabase";

export type Role = "admin" | "student";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  registeredAt: string;
  password?: string; // demo-only (local storage)
  age?: number;
  status?: "active" | "inactive"; // for admin user management
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string, age: number) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LS_KEY = "auth:user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Map a profile row to AuthUser shape
  const fromProfile = useCallback((profile: any): AuthUser => ({
    id: profile.id,
    name: profile.name ?? profile.email?.split("@")[0] ?? "User",
    email: profile.email,
    role: profile.role,
    registeredAt: profile.registered_at ?? new Date().toISOString(),
    age: profile.age ?? undefined,
    status: profile.status ?? "active",
  }), []);

  useEffect(() => {
    const init = async () => {
      if (USE_SUPABASE && supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: prof } = await supabase
            .from("quiz_profiles")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle();
          if (prof) {
            const mapped = fromProfile(prof);
            setUser(mapped);
            localStorage.setItem(LS_KEY, JSON.stringify(mapped));
          }
        } else {
          // If no Supabase session, fall back to localStorage state for backwards compatibility
          const raw = localStorage.getItem(LS_KEY);
          if (raw) setUser(JSON.parse(raw));
        }
        setLoading(false);
        const { data: sub } = supabase.auth.onAuthStateChange(async (evt, sess) => {
          if (sess?.user) {
            // Only update if we don't already have this user or if it's a sign-in event
            const currentUser = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
            if (!currentUser || currentUser.id !== sess.user.id || evt === 'SIGNED_IN') {
              const { data: prof2 } = await supabase
                .from("quiz_profiles")
                .select("*")
                .eq("id", sess.user.id)
                .maybeSingle();
              if (prof2) {
                const mapped = fromProfile(prof2);
                setUser(mapped);
                localStorage.setItem(LS_KEY, JSON.stringify(mapped));
              }
            }
          } else {
            setUser(null);
            localStorage.removeItem(LS_KEY);
          }
        });
        return () => sub.subscription.unsubscribe();
      }

      // Local mode
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) setUser(JSON.parse(raw));
      } catch (e) {
        console.error("Failed to parse auth user from localStorage", e);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [fromProfile]);

  const persist = useCallback((u: AuthUser) => {
    setUser(u);
    localStorage.setItem(LS_KEY, JSON.stringify(u));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (USE_SUPABASE && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const uid = data.user?.id;
      if (!uid) throw new Error("Login failed: no user id");

      // Wait for auth state to be established
      await new Promise(resolve => setTimeout(resolve, 100));

      // Ensure profile exists
      const { data: profExisting } = await supabase
        .from("quiz_profiles").select("*").eq("id", uid).maybeSingle();
      let profile = profExisting;
      if (!profile) {
        const name = email.split("@")[0];
        const { data: profInsert, error: profErr } = await supabase
          .from("quiz_profiles")
          .insert({ id: uid, name, email, role: "student", status: "active" })
          .select("*")
          .single();
        if (profErr) throw profErr;
        profile = profInsert;
      }
      const mapped = fromProfile(profile);

      // Set user state immediately and let onAuthStateChange handle the rest
      setUser(mapped);
      localStorage.setItem(LS_KEY, JSON.stringify(mapped));

      return mapped;
    }

    // Local mode
    const existing = db.findUserByEmail(email);
    if (!existing) throw new Error("No account found for this email. Please register.");
    if (existing.status === "inactive") throw new Error("This account is inactive. Please contact the administrator.");
    if (!existing.password) throw new Error("This account has no password set. Please register again to set a password.");
    if (existing.password !== password) throw new Error("Incorrect password.");
    persist(existing);
    return existing;
  }, [persist, fromProfile]);

  const register = useCallback(async (name: string, email: string, password: string, age: number) => {
    if (USE_SUPABASE && supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw new Error(`Auth signup failed: ${error.message}`);

        const uid = data.user?.id;
        if (!uid) throw new Error("Sign up failed: no user id returned");

        // Wait a moment for auth to be established
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if profile already exists
        const { data: existingProf, error: selectErr } = await supabase
          .from("quiz_profiles")
          .select("*")
          .eq("id", uid)
          .maybeSingle();

        if (selectErr) throw new Error(`Profile check failed: ${selectErr.message}`);

        let prof;
        if (existingProf) {
          // Update existing profile
          const { data: updatedProf, error: updateErr } = await supabase
            .from("quiz_profiles")
            .update({ name, email, role: "student", status: "active", age })
            .eq("id", uid)
            .select("*")
            .single();
          if (updateErr) throw new Error(`Profile update failed: ${updateErr.message}`);
          prof = updatedProf;
        } else {
          // Insert new profile
          const { data: newProf, error: insertErr } = await supabase
            .from("quiz_profiles")
            .insert({ id: uid, name, email, role: "student", status: "active", age })
            .select("*")
            .single();
          if (insertErr) throw new Error(`Profile creation failed: ${insertErr.message}`);
          prof = newProf;
        }

        const mapped = fromProfile(prof);
        persist(mapped);
        return mapped;
      } catch (error) {
        console.error('Registration error:', error);
        throw error;
      }
    }

    // Local mode
    const existing = db.findUserByEmail(email);
    if (existing) throw new Error("Email already registered. Please sign in.");
    const created = db.registerUser(name, email, password, age);
    persist(created);
    return created;
  }, [persist, fromProfile]);

  const logout = useCallback(() => {
    if (USE_SUPABASE && supabase) {
      void supabase.auth.signOut();
    }
    setUser(null);
    localStorage.removeItem(LS_KEY);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
