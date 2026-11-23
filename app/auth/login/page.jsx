"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE } from "../../utils/api";
import { ROLE_HOMEPAGE } from "../../utils/roles";
import styles from "./loginPage.module.css";


function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || result.message || "Invalid email or password");
        return;
      }
      const token = result.token ?? result.data?.token;

      if (!token) {
        setError(result.error || result.message || "Invalid email or password");
        return;
      }

      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      localStorage.removeItem("role");
      sessionStorage.removeItem("role");

      const storage = remember ? localStorage : sessionStorage;

      storage.setItem("token", token);
      storage.setItem("role", result.user.role);

      router.push(ROLE_HOMEPAGE[result.user.role] ?? "/");
    } catch (err) {
      console.error("Login request failed:", err);
      setError("Server is currently unavailable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.leftContainer}>
        <div className={styles.smallIconTextContainer}>
          <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 46 46 18M18 18h28v28" /></svg>
          <span>MTOGO</span>
        </div>
        <div className={styles.largeIconTextContainer}>
          <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 46 46 18M18 18h28v28" /></svg>
          <h1>Bestil fra dit kvarter.</h1>
        </div>
      </div>

      <div className={styles.rightContainer}>
      <form className={styles.credentialsContainer} onSubmit={handleSubmit}>
        <h2>Log ind</h2>

        <div>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="sara@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="password">Adgangskode</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <label className={styles.rememberContainer}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Husk mig på denne enhed
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Logger ind..." : "Log ind"}
        </button>
      <p>
        Ny på MTOGO? <Link href="/auth/register">Opret kundekonto</Link>
      </p>
      </form>
      </div>
    </main>
  );
}

export default LoginPage;
