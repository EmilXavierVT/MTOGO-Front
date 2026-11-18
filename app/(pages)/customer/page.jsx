"use client";
import LogoutButton from "../../components/LogoutButton";
import RequireRole from "../../components/RequireRole";

function CustomerPage() {
  return (
    <RequireRole role="CUSTOMER">
      <main>
        <h1>Customer</h1>

        <LogoutButton />
      </main>
    </RequireRole>
  );
}

export default CustomerPage;
