import { useState, useEffect } from 'react'
import { apiRequest } from '../api'
import { LIMITS } from '../constants'

// The temporary password is sensitive; don't leave it on screen indefinitely
export const TEMP_PASSWORD_VISIBLE_MS = 60000

function ResetPasswordPanel({ id, onSessionExpired }) {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(null), TEMP_PASSWORD_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [result])

  function handleChange(e) {
    setEmail(e.target.value)
    setResult(null)
    setError('')
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
    <section id={id} tabIndex={-1} className="panel-card warden-section" aria-labelledby="reset-password-heading">
      <h2 id="reset-password-heading" className="panel-heading">Reset a student's password</h2>
      <form onSubmit={handleSubmit} noValidate>
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
              Share it with the student privately. They must choose a new password when they log in.
              It won't be shown again and disappears from this screen in a minute.
            </p>
            <div className="reset-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>
                Hide password
              </button>
            </div>
          </div>
        )}

        <button type="submit" className="btn btn-warden" disabled={submitting}>
          {submitting ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </section>
  )
}

export default ResetPasswordPanel
