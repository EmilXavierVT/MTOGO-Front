"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "../utils/api";
import { ROLE_HOMEPAGE } from "../utils/roles";

function clearSession() {
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
  localStorage.removeItem("role");
  sessionStorage.removeItem("role");
}

function RequiredRole({ role, children }) {
  const [allowed, setAllowed] = useState(false);
  const router = useRouter();

  useEffect(() => {
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

        if (response.status === 401) {
          clearSession();
          router.replace("/auth/login");
          return;
        }

        const user = await response.json();

        if (user.role !== role) {
          router.replace(ROLE_HOMEPAGE[user.role] ?? "/");
          return;
        }

        setAllowed(true);
      } catch {
        router.replace("/auth/login");
      }
    };

    checkSession();
  }, [role, router]);

  if (!allowed) return <p>Loading...</p>;
  return children;
}

export default RequiredRole;
