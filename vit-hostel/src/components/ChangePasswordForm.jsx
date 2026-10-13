import { useState } from 'react'
import { apiRequest } from '../api'
import { LIMITS } from '../constants'

const emptyForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

function ChangePasswordForm({ onChanged, onCancel, onSessionExpired, forced = false }) {
  const [formData, setFormData] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const { currentPassword, newPassword, confirmPassword } = formData

    if (currentPassword === '' || newPassword === '' || confirmPassword === '') {
      setError('Please fill in all fields.')
      return
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setError('')
    setSubmitting(true)
    let data
    try {
      data = await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword }
      })
    } catch (err) {
      setSubmitting(false)
      if (err.status === 401 && onSessionExpired) return onSessionExpired()
      setError(err.message)
      return
    }
    setSubmitting(false)
    onChanged(data)
  }

  return (
    <>
      <h2 className="panel-heading">{forced ? 'Choose a new password' : 'Change password'}</h2>
      <p className="submitting-as">
        {forced
          ? 'Your password was reset by the warden. Choose a new password to continue.'
          : 'Enter your current password, then choose a new one.'}
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="change-current">Current password</label>
          <input
            id="change-current"
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            maxLength={LIMITS.password}
            value={formData.currentPassword}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="change-new">New password</label>
          <input
            id="change-new"
            type="password"
            name="newPassword"
            placeholder="At least 6 characters"
            autoComplete="new-password"
            maxLength={LIMITS.password}
            value={formData.newPassword}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="change-confirm">Confirm new password</label>
          <input
            id="change-confirm"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            maxLength={LIMITS.password}
            value={formData.confirmPassword}
            onChange={handleChange}
          />
        </div>

        {error && <p className="error-msg" role="alert">{error}</p>}

        <div className="login-buttons">
          <button type="submit" className="btn btn-student" disabled={submitting}>
            {submitting ? 'Saving…' : 'Update password'}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </>
  )
}

export default ChangePasswordForm
