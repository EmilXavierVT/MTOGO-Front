
"use client";
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { API_BASE } from "../../../utils/api";

function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [remember, setRemember] = useState(true)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const router = useRouter()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const response = await fetch(`${API_BASE}/users/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            })

            if (!response.ok) {
                setError(`Login failed (${response.status})`)
                return
            }

            const result = await response.json()

            // saveSession(result.data.token, result.data.data, remember)
            router.push('/homepage')
        }
        catch {
            setError('Server is currently unavailable')
        }
        finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <form onSubmit={handleSubmit}>
                <h1>Log in</h1>

                <div>
                    <label htmlFor="email">E-mail address</label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>

                <div>
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>

                <label>
                    <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                    />
                    Remember me on this device
                </label>

                {error && <p>{error}</p>}

                <button type="submit" disabled={loading}>
                    {loading ? 'Logging in...' : 'Log in'}
                </button>
            </form>

            <p>
                No account yet? <Link href="/auth/registerPage">Register</Link>
            </p>
        </div>
    )
}

export default LoginPage;
