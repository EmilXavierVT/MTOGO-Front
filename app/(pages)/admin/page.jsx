"use client";
import LogoutButton from "../../components/LogoutButton";
import RequiredRole from "../../components/RequiredRole";

function AdminPage() {
  return (
    <RequiredRole role="ADMIN">
      <main>
        <h1>Admin</h1>

        <LogoutButton />
      </main>
    </RequiredRole>
  );
}

export default AdminPage;
