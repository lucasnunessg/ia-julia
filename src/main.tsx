import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Login from './Login.tsx'

function Root() {
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    const isAuth = localStorage.getItem('authenticated') === 'true'
    setAuthenticated(isAuth)
  }, [])

  const handleLogin = () => {
    setAuthenticated(true)
  }

  return authenticated ? <App /> : <Login onLogin={handleLogin} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
