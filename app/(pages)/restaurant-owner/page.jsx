"use client";
import LogoutButton from "../../components/LogoutButton";
import RequiredRole from "../../components/RequiredRole";
import MenuSelector from "./components/MenuSelector";
import styles from "./restaurantOwner.module.css";

function RestaurantOwnerPage() {
  return (
    <RequiredRole role="RESTAURANT_OWNER">
      <main className={styles.page}>
        <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Restaurant dashboard</p>
            <h1>Manage your menu</h1>
            <p className={styles.description}>Create dishes and keep your restaurant menu up to date.</p>
          </div>
          <div className={styles.logout}><LogoutButton /></div>
        </header>
        <MenuSelector />
        </div>
      </main>
    </RequiredRole>
  );
}

export default RestaurantOwnerPage;

