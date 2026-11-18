
"use client";

import { useEffect } from "react";
import LogoutButton from "../../components/LogoutButton";
import { useRouter } from "next/navigation";

function CustomerPage() {
  
     const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem("token") ||
            sessionStorage.getItem("token");

        if (!token) {
            router.replace("/auth/login");
        }
    }, [router]);



    return (
        <main>
            <h1>Customer</h1>

            <LogoutButton />

           
        </main>
    );
}

export default CustomerPage;
