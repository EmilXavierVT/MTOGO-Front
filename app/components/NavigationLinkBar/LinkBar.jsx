import Link from "next/link";

function LinkBar() {
  return (
    <nav>
      <div>
        <Link href="/auth/register">Register</Link>
      </div>

      <div>
        <Link href="/auth/login">Login</Link>
      </div>
    </nav>
  );
}

export default LinkBar;
