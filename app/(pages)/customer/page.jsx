"use client";
import LogoutButton from "../../components/LogoutButton";
import RequiredRole from "../../components/RequiredRole";
import DisplayRestaurant from "./components/DisplayRestaurant";

function CustomerPage() {
  return (
    <RequiredRole role="CUSTOMER">
      <main>
        <h1>Customer</h1>
        <DisplayRestaurant />
        <LogoutButton />
      </main>
    </RequiredRole>
  );
}

export default CustomerPage;