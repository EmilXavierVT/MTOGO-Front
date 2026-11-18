"use client";
import LogoutButton from "../../components/LogoutButton";
import RequiredRole from "../../components/RequiredRole";

function RestaurantOwnerPage() {
  return (
    <RequiredRole role="ADMIN">
      <main>
        <h1>RestaurantOwner</h1>

        <LogoutButton />
      </main>
    </RequiredRole>
  );
}

export default RestaurantOwnerPage;
