"use client";
import LogoutButton from "../../components/LogoutButton";
import RequiredRole from "../../components/RequiredRole";
import DisplayRestaurant from "./components/DisplayRestaurant";
import styles from "./customer.module.css";

function CustomerPage() {
  return (
    <RequiredRole role="CUSTOMER">
      <main className={styles.page}>
        <h1>Customer</h1>
        <DisplayRestaurant />
        <LogoutButton />
      </main>
    </RequiredRole>
  );
}

export default CustomerPage;
