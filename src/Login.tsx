import { useState } from 'react'
import './Login.css'

interface LoginProps {
  onLogin: () => void
}

function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const emailCorreto = import.meta.env.VITE_EMAIL_LOGIN
    const senhaCorreta = import.meta.env.VITE_SENHA_LOGIN

    console.log('Email digitado:', email)
    console.log('Email correto:', emailCorreto)
    console.log('Senha digitada:', senha)
    console.log('Senha correta:', senhaCorreta)

    if (email === emailCorreto && senha === senhaCorreta) {
      localStorage.setItem('authenticated', 'true')
      onLogin()
    } else {
      setErro('Email ou senha incorretos')
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>🔒 Login</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="password-field">
            <input
              type={mostrarSenha ? "text" : "password"}
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setMostrarSenha(!mostrarSenha)}
            >
              {mostrarSenha ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {erro && <p className="erro">{erro}</p>}
          <button type="submit">Entrar</button>
        </form>
      </div>
    </div>
  )
}

export default Login
