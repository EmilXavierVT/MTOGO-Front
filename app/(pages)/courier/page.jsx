"use client";
import LogoutButton from "../../components/LogoutButton";
import RequireRole from "../../components/RequireRole";

function CourierPage() {
  return (
    <RequireRole role="COURIER">
      <main>
        <h1>Courier</h1>

        <LogoutButton />
      </main>
    </RequireRole>
  );
}

export default CourierPage;
