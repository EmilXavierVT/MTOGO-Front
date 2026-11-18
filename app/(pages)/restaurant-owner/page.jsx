"use client";
import LogoutButton from "../../components/LogoutButton";
import RequireRole from "../../components/RequireRole";

function RestaurantOwnerPage() {
  return (
    <RequireRole role="ADMIN">
      <main>
        <h1>RestaurantOwner</h1>

        <LogoutButton />
      </main>
    </RequireRole>
  );
}

export default RestaurantOwnerPage;
