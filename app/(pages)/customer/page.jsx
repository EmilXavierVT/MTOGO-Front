"use client";
import LogoutButton from "../../components/LogoutButton";
import RequiredRole from "../../components/RequiredRole";

function CustomerPage() {
  return (
    <RequiredRole role="CUSTOMER">
      <main>
        <h1>Customer</h1>

        <LogoutButton />
      </main>
    </RequiredRole>
  );
}

export default CustomerPage;
