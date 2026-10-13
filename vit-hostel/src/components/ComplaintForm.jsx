import { useState } from 'react'
import { HOSTEL_BLOCKS, COMPLAINT_TYPES, LIMITS } from '../constants'

function ComplaintForm({ user, addComplaint }) {
  const [formData, setFormData] = useState({
    hostelType: user.hostelType || '',
    block: user.block || '',
    room: user.room || '',
    complaintType: '',
    description: '',
    urgent: false
  })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setSuccess(false)
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'hostelType' ? { block: '' } : {})
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (
      formData.hostelType === '' ||
      formData.block === '' ||
      formData.room.trim() === '' ||
      formData.complaintType === '' ||
      formData.description.trim() === ''
    ) {
      setError('Please fill in all required fields.')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      // false means the session expired and the dashboard is unmounting
      if (await addComplaint(formData) === false) return
      setFormData({ ...formData, complaintType: '', description: '', urgent: false })
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const blocks = HOSTEL_BLOCKS[formData.hostelType] || []

  return (
    <div className="panel-card">
      <h2 className="panel-heading">Submit a Complaint</h2>
      <p className="submitting-as">
        Submitting as <strong>{user.name}</strong> ({user.regNumber})
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="complaint-hostel-type">Hostel Type</label>
          <select id="complaint-hostel-type" name="hostelType" value={formData.hostelType} onChange={handleChange}>
            <option value="">-- Select Hostel --</option>
            {Object.keys(HOSTEL_BLOCKS).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="complaint-block">Hostel Block</label>
          <select id="complaint-block" name="block" value={formData.block} onChange={handleChange}>
            <option value="">-- Select Block --</option>
            {blocks.map((b) => (
              <option key={b} value={b}>Block {b}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="complaint-room">Room Number</label>
          <input
            id="complaint-room"
            type="text"
            name="room"
            placeholder="e.g. 204"
            maxLength={LIMITS.room}
            value={formData.room}
            onChange={handleChange}
          />
        </div>

        <fieldset className="form-group radio-fieldset">
          <legend>Complaint Type</legend>
          <div className="radio-group">
            {COMPLAINT_TYPES.map((type) => (
              <label key={type} className="radio-label">
                <input
                  type="radio"
                  name="complaintType"
                  value={type}
                  checked={formData.complaintType === type}
                  onChange={handleChange}
                />
                {type}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-group">
          <label htmlFor="complaint-description">Description</label>
          <textarea
            id="complaint-description"
            name="description"
            rows="4"
            maxLength={LIMITS.description}
            placeholder="Describe your complaint..."
            value={formData.description}
            onChange={handleChange}
          />
        </div>

        <div className="form-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="urgent"
              checked={formData.urgent}
              onChange={handleChange}
            />
            Mark as Urgent
          </label>
        </div>

        {error && <p className="error-msg" role="alert">{error}</p>}
        {success && <p className="success-msg" role="status">Complaint submitted.</p>}

        <button type="submit" className="btn btn-submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Complaint'}
        </button>
      </form>
    </div>
  )
}

export default ComplaintForm
