
"use client";

import { useEffect, useState } from "react";
import LogoutButton from "../../components/LogoutButton";
import { useRouter } from "next/navigation";

function HomePage() {
    const [role] = useState(() => {
        if (typeof window === "undefined") return "";

        return localStorage.getItem("role") ||
            sessionStorage.getItem("role") || "";
    });

    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem("token") ||
            sessionStorage.getItem("token");

        if (!token) {
            router.replace("/auth/loginPage");
        }
    }, [router]);

    if (!role) return null;

    return (
        <main>
            <h1>Welcome to MTOGO</h1>

            <LogoutButton />

            {role === "CUSTOMER" && <h2>Customer homepage</h2>}
            {role === "COURIER" && <h2>Courier homepage</h2>}
            {role === "RESTAURANT_OWNER" && <h2>Restaurant owner homepage</h2>}
            {role === "ADMIN" && <h2>Admin homepage</h2>}
        </main>
    );
}

export default HomePage;
