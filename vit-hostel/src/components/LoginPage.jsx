import { useState } from 'react'
import vitLogo from '../assets/vit-logo.jpg'
import { apiRequest } from '../api'
import { HOSTEL_BLOCKS, LIMITS, REG_NUMBER_PATTERN, MIN_PASSWORD_LENGTH } from '../constants'

const emptyRegister = {
  name: '',
  regNumber: '',
  email: '',
  password: '',
  hostelType: '',
  block: '',
  room: ''
}

// Same shape the backend accepts; checked here so the user gets one clear
// message instead of the browser's built-in bubble
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

// notice: optional message shown above the form, e.g. after a session expired
function LoginPage({ onLogin, notice }) {
  const [mode, setMode] = useState('login')
  const [loginData, setLoginData] = useState({ email: '', password: '' })
  const [registerData, setRegisterData] = useState(emptyRegister)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleLoginChange(e) {
    setLoginData({ ...loginData, [e.target.name]: e.target.value })
    setError('')
  }

  function handleRegisterChange(e) {
    const { name, value } = e.target
    setRegisterData({
      ...registerData,
      [name]: value,
      ...(name === 'hostelType' ? { block: '' } : {})
    })
    setError('')
  }

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  async function submit(path, body) {
    setSubmitting(true)
    setError('')
    try {
      onLogin(await apiRequest(path, { method: 'POST', body }))
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  function handleLogin(e) {
    e.preventDefault()
    if (loginData.email.trim() === '' || loginData.password === '') {
      setError('Please enter your email and password.')
      return
    }
    if (!EMAIL_PATTERN.test(loginData.email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    submit('/api/auth/login', loginData)
  }

  function handleRegister(e) {
    e.preventDefault()
    if (Object.values(registerData).some((v) => v.trim() === '')) {
      setError('Please fill in all fields.')
      return
    }
    if (!EMAIL_PATTERN.test(registerData.email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    if (!REG_NUMBER_PATTERN.test(registerData.regNumber.trim().toUpperCase())) {
      setError('Please enter a valid registration number (e.g. 23BCE1234).')
      return
    }
    if (registerData.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    submit('/api/auth/register', registerData)
  }

  const blocks = HOSTEL_BLOCKS[registerData.hostelType] || []

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-icon">
            <img src={vitLogo} alt="VIT Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
          </div>
          <h1>VIT Hostel</h1>
          <p className="login-subtitle">Complaint & Request System</p>
        </div>

        {notice && <p className="notice-msg" role="status">{notice}</p>}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} noValidate>
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                name="email"
                placeholder="you@vitstudent.ac.in"
                autoComplete="email"
                maxLength={LIMITS.email}
                value={loginData.email}
                onChange={handleLoginChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                name="password"
                placeholder="Your password"
                autoComplete="current-password"
                maxLength={LIMITS.password}
                value={loginData.password}
                onChange={handleLoginChange}
              />
            </div>

            {error && <p className="error-msg" role="alert">{error}</p>}

            <div className="login-buttons">
              <button type="submit" className="btn btn-student" disabled={submitting}>
                {submitting ? 'Logging in…' : 'Login'}
              </button>
            </div>

            <p className="auth-switch">
              New student?{' '}
              <button type="button" className="link-btn" onClick={() => switchMode('register')}>
                Create an account
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} noValidate>
            <div className="form-group">
              <label htmlFor="register-name">Full Name</label>
              <input id="register-name" type="text" name="name" placeholder="Your full name" maxLength={LIMITS.name} value={registerData.name} onChange={handleRegisterChange} />
            </div>

            <div className="form-group">
              <label htmlFor="register-reg-number">Registration Number</label>
              <input id="register-reg-number" type="text" name="regNumber" placeholder="e.g. 23BCE1234" maxLength={LIMITS.regNumber} value={registerData.regNumber} onChange={handleRegisterChange} />
            </div>

            <div className="form-group">
              <label htmlFor="register-email">Email</label>
              <input id="register-email" type="email" name="email" placeholder="you@vitstudent.ac.in" autoComplete="email" maxLength={LIMITS.email} value={registerData.email} onChange={handleRegisterChange} />
            </div>

            <div className="form-group">
              <label htmlFor="register-password">Password</label>
              <input id="register-password" type="password" name="password" placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} autoComplete="new-password" maxLength={LIMITS.password} value={registerData.password} onChange={handleRegisterChange} />
            </div>

            <div className="form-group">
              <label htmlFor="register-hostel-type">Hostel Type</label>
              <select id="register-hostel-type" name="hostelType" value={registerData.hostelType} onChange={handleRegisterChange}>
                <option value="">-- Select Hostel --</option>
                {Object.keys(HOSTEL_BLOCKS).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="register-block">Hostel Block</label>
              <select id="register-block" name="block" value={registerData.block} onChange={handleRegisterChange}>
                <option value="">-- Select Block --</option>
                {blocks.map((b) => (
                  <option key={b} value={b}>Block {b}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="register-room">Room Number</label>
              <input id="register-room" type="text" name="room" placeholder="e.g. 204" maxLength={LIMITS.room} value={registerData.room} onChange={handleRegisterChange} />
            </div>

            {error && <p className="error-msg" role="alert">{error}</p>}

            <div className="login-buttons">
              <button type="submit" className="btn btn-student" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create Account'}
              </button>
            </div>

            <p className="auth-switch">
              Already have an account?{' '}
              <button type="button" className="link-btn" onClick={() => switchMode('login')}>
                Log in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default LoginPage
