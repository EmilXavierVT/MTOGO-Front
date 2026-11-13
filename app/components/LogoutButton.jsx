"use client";
import { useRouter } from "next/navigation";

function LogoutButton() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    localStorage.removeItem("role");
    sessionStorage.removeItem("role");

    router.replace("/auth/loginPage");
  };

  return (
    <button type="button" onClick={handleLogout}>
      Log out
    </button>
  );
}

export default LogoutButton;
