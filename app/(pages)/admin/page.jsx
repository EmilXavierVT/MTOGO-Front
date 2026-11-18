"use client";
import LogoutButton from "../../components/LogoutButton";
import RequireRole from "../../components/RequireRole";

function AdminPage() {
  return (
    <RequireRole role="ADMIN">
      <main>
        <h1>Admin</h1>

        <LogoutButton />
      </main>
    </RequireRole>
  );
}

export default AdminPage;
