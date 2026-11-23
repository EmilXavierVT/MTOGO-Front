import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (

    <main className={styles.page}>
      <div className={styles.leftContainer}>
        <div className={styles.smallIconTextContainer}>
          <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 46 46 18M18 18h28v28" /></svg>
          <span>MTOGO</span>
        </div>
        <div className={styles.largeIconTextContainer}>
          <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 46 46 18M18 18h28v28" /></svg>
          <h1>Bestil fra dit kvarter.</h1>
        </div>
      </div> 

      <div className={styles.rightContainer}>
        <div className={styles.credentialsContainer}>
          <Link href="/auth/login">Login</Link>
          <Link href="/auth/register">Register</Link>
        </div>
      </div>
    </main>
   
 
  );
}
