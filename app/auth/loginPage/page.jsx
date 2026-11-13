
"use client";
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { API_BASE } from "../../utils/api";

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
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            })

            console.log('Login status:', response.status)

            /*
            if (!response.ok) {
                const errorResponse = await response.text()

                let errorMessage = errorResponse
                try {
                    const data = JSON.parse(errorResponse)
                    errorMessage = data.error || data.message || errorResponse
                } catch {
                    // Backend returned plain text
                }

                console.error('Login failed:', response.status, errorMessage)
                setError(errorMessage || `Login failed (${response.status})`)
                return
            }
            */

            const result = await response.json()
            const token = result.token ?? result.data?.token

            if (!token) {
                console.error('Login response did not contain a token')
                setError(result.error || 'Login response did not contain a token')
                return
            }

            const storage = remember ? localStorage : sessionStorage
            storage.setItem('token', token)

            router.push('/homepage')
        }
        catch (err) {
            console.error('Login request failed:', err)
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
