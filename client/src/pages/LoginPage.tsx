import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Link, useLocation } from "wouter";
import { Lock } from "lucide-react";

export function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data.user) {
      // Login successful, redirect to admin
      // The session is automatically persisted by supabase-js
      // We also trigger a reload so the auth context picks up the session
      window.location.href = "/admin";
    }
  };

  return (
    <div className="page-wrap auth-panel" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <section className="page-heading" style={{ maxWidth: "400px", width: "100%", margin: "0 auto", textAlign: "left", background: "var(--color-bg)", padding: "2rem", borderRadius: "12px", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Lock size={20} color="var(--color-coral)" />
          <div className="eyebrow" style={{ margin: 0 }}>Private studio</div>
        </div>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Admin Sign In</h1>
        <p style={{ marginBottom: "2rem", color: "var(--color-text-secondary)" }}>Enter your credentials to access the publishing desk.</p>
        
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label htmlFor="email" style={{ fontSize: "0.875rem", fontWeight: 500 }}>Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@hamispro.io"
              required
              className="search-input"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label htmlFor="password" style={{ fontSize: "0.875rem", fontWeight: 500 }}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="search-input"
              style={{ width: "100%" }}
            />
          </div>
          
          {error && (
            <div style={{ padding: "0.75rem", background: "rgba(255,50,50,0.1)", color: "var(--color-coral)", borderRadius: "6px", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            className="button" 
            disabled={loading}
            style={{ width: "100%", marginTop: "1rem" }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <div style={{ marginTop: "2rem", textAlign: "center" }}>
          <Link href="/"><a style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", textDecoration: "none" }}>&larr; Back to public site</a></Link>
        </div>
      </section>
    </div>
  );
}
