"use client";

import { useEffect } from "react";
import LogoutButton from "../../components/LogoutButton";
import { useRouter } from "next/navigation";

function CourierPage() {
  const router = useRouter();

  useEffect(() => {
    const token =
      localStorage.getItem("token") || sessionStorage.getItem("token");

    if (!token) {
      router.replace("/auth/login");
    }
  }, [router]);

  return (
    <main>
      <h1>Courier</h1>

      <LogoutButton />
    </main>
  );
}

export default CourierPage;
