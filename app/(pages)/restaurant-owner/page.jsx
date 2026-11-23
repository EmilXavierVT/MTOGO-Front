"use client";
import Navbar from "./components/Navbar";
import RequiredRole from "../../components/RequiredRole";
import MenuSelector from "./components/MenuSelector";
import styles from "./restaurantOwner.module.css";

function RestaurantOwnerPage() {
  return (
    <RequiredRole role="RESTAURANT_OWNER">
      <Navbar />
      <main className={styles.page}>
        <div className={styles.content}>
        <MenuSelector />
        </div>
      </main>
    </RequiredRole>
  );
}

export default RestaurantOwnerPage;

