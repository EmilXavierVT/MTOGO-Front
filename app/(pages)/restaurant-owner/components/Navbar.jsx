import Link from "next/link";
import LogoutButton from "../../../components/LogoutButton";
import styles from "./Navbar.module.css";

function Navbar() {
  return (
    <header className={styles.navbar}>
      <nav className={styles.navbarContainer} aria-label="Restaurant navigation">
        <Link className={styles.smallIconTextContainer} href="/">
          <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 46 46 18M18 18h28v28" /></svg>
          <span>MTOGO</span>
        </Link>
        <Link className={styles.navigationLink} href="/restaurant-owner" aria-current="page">Menu</Link>
        <div className={styles.logoutContainer}><LogoutButton /></div>
      </nav>
    </header>
  );
}

export default Navbar;
