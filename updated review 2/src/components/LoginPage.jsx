import { useState } from 'react'

function LoginPage({ onLogin }) {
  const [name, setName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [error, setError] = useState(false)

  function handleStudentLogin() {
    if (name.trim() === '' || idNumber.trim() === '') {
      setError(true)
      return
    }
    setError(false)
    onLogin('student')
  }

  function handleWardenLogin() {
    if (name.trim() === '' || idNumber.trim() === '') {
      setError(true)
      return
    }
    setError(false)
    onLogin('warden')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-icon">
            <img src="/images/c6c2e9022f25f404fe108a4cfefab222.jpg" alt="VIT Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
          </div>
          <h1>VIT Hostel</h1>
          <p className="login-subtitle">Complaint & Request System</p>
        </div>

        <div className="form-group">
          <label>Full Name</label>
          <input
            type="text"
            placeholder="Enter your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Registration No. / Staff ID</label>
          <input
            type="text"
            placeholder="e.g. 23BCE1234 or STAFF001"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </div>

        {error && (
          <p className="error-msg">Please fill in both fields.</p>
        )}

        <div className="login-buttons">
          <button className="btn btn-student" onClick={handleStudentLogin}>
            Login as Student
          </button>
          <button className="btn btn-warden" onClick={handleWardenLogin}>
            Login as Warden
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
