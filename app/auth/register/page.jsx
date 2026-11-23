"use client";
import { useState } from "react";
import Link from "next/link";
import { API_BASE } from "../../utils/api";
import styles from "./registerPage.module.css";

function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errorResponse = await response.text();
        setError(errorResponse || "Registration failed");
        return;
      }

      setSuccess("Account created successfully");
      setForm({
        name: "",
        email: "",
        password: "",
      });
    } catch {
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
        <h2>Opret kundekonto</h2>
        <p>Opret en konto for at bestille og følge dine ordrer.</p>

        <div>
          <label htmlFor="name">Fulde navn</label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Dit navn"
            value={form.name}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="navn@eksempel.dk"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label htmlFor="password">Adgangskode</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Vælg en adgangskode"
            value={form.password}
            onChange={handleChange}
            required
          />
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {success && <p className={styles.success} role="status">{success}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Opretter konto..." : "Opret konto"}
        </button>
        <p>Har du allerede en konto? <Link href="/auth/login">Log ind</Link></p>
      </form>
      </div>
    </main>
  );
}

export default RegisterPage;
