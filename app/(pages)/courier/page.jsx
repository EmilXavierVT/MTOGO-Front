"use client";
import LogoutButton from "../../components/LogoutButton";
import RequiredRole from "../../components/RequiredRole";

function CourierPage() {
  return (
    <RequiredRole role="COURIER">
      <main>
        <h1>Courier</h1>

        <LogoutButton />
      </main>
    </RequiredRole>
  );
}

export default CourierPage;
