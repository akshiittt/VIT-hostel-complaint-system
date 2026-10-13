import { useState } from 'react'
import { apiRequest } from '../api'
import { LIMITS } from '../constants'

function ResetPasswordPanel({ onSessionExpired }) {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    setEmail(e.target.value)
    setResult(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (email.trim() === '') {
      setError("Please enter the student's email.")
      return
    }

    setError('')
    setResult(null)
    setSubmitting(true)
    try {
      setResult(await apiRequest('/api/auth/reset-password', { method: 'POST', body: { email: email.trim() } }))
    } catch (err) {
      if (err.status === 401 && onSessionExpired) return onSessionExpired()
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="panel-card warden-section">
      <h2 className="panel-heading">Reset a student's password</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="reset-email">Student email</label>
          <input
            id="reset-email"
            type="email"
            name="email"
            placeholder="student@vitstudent.ac.in"
            maxLength={LIMITS.email}
            value={email}
            onChange={handleChange}
          />
        </div>

        {error && <p className="error-msg" role="alert">{error}</p>}
        {result && (
          <div className="reset-result" role="status">
            <p>Temporary password for {result.email}: <code>{result.temporaryPassword}</code></p>
            <p className="reset-note">
              Share it with the student privately. They must choose a new password when they log in. It won't be shown again.
            </p>
          </div>
        )}

        <button type="submit" className="btn btn-warden" disabled={submitting}>
          {submitting ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </div>
  )
}

export default ResetPasswordPanel
