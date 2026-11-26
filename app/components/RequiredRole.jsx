"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "../utils/api";
import { ROLE_HOMEPAGE } from "../utils/roles";
import { FeatureFlagsProvider } from "../features/FeatureFlagsProvider";

function clearSession() {
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
  localStorage.removeItem("role");
  sessionStorage.removeItem("role");
}

function RequiredRole({ role, children }) {
  const [session, setSession] = useState(null);
  const router = useRouter();

  const expireSession = useCallback(() => {
    clearSession();
    setSession(null);
    router.replace("/auth/login");
  }, [router]);

  useEffect(() => {
    let disposed = false;
    const checkSession = async () => {
      const token =
        localStorage.getItem("token") || sessionStorage.getItem("token");
      if (!token) {
        router.replace("/auth/login");
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (disposed) return;

        if (response.status === 401) {
          expireSession();
          return;
        }

        if (!response.ok) throw new Error("Could not verify the session");

        const user = await response.json();
        if (disposed) return;

        if (user.role !== role) {
          router.replace(ROLE_HOMEPAGE[user.role] ?? "/");
          return;
        }

        setSession({ token, role: user.role });
      } catch {
        if (!disposed) router.replace("/auth/login");
      }
    };

    checkSession();
    return () => { disposed = true; };
  }, [role, router, expireSession]);

  if (session?.role !== role) return <p>Loading...</p>;
  return <FeatureFlagsProvider token={session.token} onUnauthorized={expireSession}>
    {children}
  </FeatureFlagsProvider>;
}

export default RequiredRole;
