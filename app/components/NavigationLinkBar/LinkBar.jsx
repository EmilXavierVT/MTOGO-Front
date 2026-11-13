import Link from "next/link";

function LinkBar() {
  return (
    <nav>
      <div>
        <Link href="/auth/registerPage">Register</Link>
      </div>

      <div>
        <Link href="/auth/loginPage">Login</Link>
      </div>
    </nav>
  );
}

export default LinkBar;
