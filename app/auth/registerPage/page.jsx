"use client";
import { useState } from 'react'
import { API_BASE } from "../../../utils/api";

function RegisterPage() {
    const [form, setForm] = useState({
        name: '',
        email: '',
        passwordHash: '' 
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)

        try{
const response = await fetch(`${API_BASE}/users/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
})

if(!response.ok) {
    const errorResponse = await response.text()
    setError(errorResponse || 'Registration failed')
    return
}

//const result = await response.json()
//navigate
} 
catch{
    setError('Server is currently unavailable') 

        }
        finally{
            setLoading(false)
        }
    }

    return(

    <form onSubmit={handleSubmit}>
<div>
     <h1>Create account</h1>

     <div>
        <label htmlFor="name">Name</label>
        <input 
        id= "name" 
        name="name"
        type="text"
        value={form.name}
        onChange={handleChange}
        required
        />
     </div>
    
     <div>
        <label htmlFor="email">E-mail adress</label>
        <input 
        id="email"
        name="email"
        type="text"
        value={form.email}
        onChange={handleChange}
        required 
        />
     </div>

<div>
<label htmlFor="passwordHash">Password</label>
<input 
id="parswordHash"
name="passwordHash"
type="text"
value={form.passwordHash} 
onChange={handleChange}
required
/>
</div>

{error && <p>{error}</p>}

<button type="submit" disabled={loading}>
    {loading ? 'Creating account...' : 'Register'}

</button>

</div>
</form>
    )
}

export default RegisterPage