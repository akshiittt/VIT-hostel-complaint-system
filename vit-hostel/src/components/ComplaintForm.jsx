import { useState } from 'react'

const mensBlocks = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T']
const womensBlocks = ['A','B','C','D','E','F','G','H','J']

function ComplaintForm({ addComplaint }) {
  const [formData, setFormData] = useState({
    name: '',
    reg: '',
    hostelType: '',
    block: '',
    room: '',
    complaintType: '',
    description: '',
    urgent: false
  })

  const [error, setError] = useState(false)

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'hostelType' ? { block: '' } : {})
    })
  }

  function getBlocks() {
    if (formData.hostelType === 'mens') return mensBlocks
    if (formData.hostelType === 'womens') return womensBlocks
    return []
  }

  function handleSubmit(e) {
    e.preventDefault()

    if (
      formData.name.trim() === '' ||
      formData.reg.trim() === '' ||
      formData.hostelType === '' ||
      formData.block === '' ||
      formData.room.trim() === '' ||
      formData.complaintType === '' ||
      formData.description.trim() === ''
    ) {
      setError(true)
      return
    }

    setError(false)

    const hostelLabel = formData.hostelType === 'mens' ? "Men's Hostel" : "Women's Hostel"

    const newComplaint = {
      name: formData.name,
      reg: formData.reg,
      hostelType: hostelLabel,
      block: formData.block,
      room: formData.room,
      complaintType: formData.complaintType,
      description: formData.description,
      urgent: formData.urgent,
      status: 'Pending'
    }

    addComplaint(newComplaint)

    setFormData({
      name: '',
      reg: '',
      hostelType: '',
      block: '',
      room: '',
      complaintType: '',
      description: '',
      urgent: false
    })
  }

  return (
    <div className="panel-card">
      <h2 className="panel-heading">Submit a Complaint</h2>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Student Name</label>
          <input
            type="text"
            name="name"
            placeholder="Your name"
            value={formData.name}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Registration Number</label>
          <input
            type="text"
            name="reg"
            placeholder="e.g. 23BCE1234"
            value={formData.reg}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Hostel Type</label>
          <select name="hostelType" value={formData.hostelType} onChange={handleChange}>
            <option value="">-- Select Hostel --</option>
            <option value="mens">Men's Hostel</option>
            <option value="womens">Women's Hostel</option>
          </select>
        </div>

        <div className="form-group">
          <label>Hostel Block</label>
          <select name="block" value={formData.block} onChange={handleChange}>
            <option value="">-- Select Block --</option>
            {getBlocks().map((b) => (
              <option key={b} value={b}>Block {b}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Room Number</label>
          <input
            type="text"
            name="room"
            placeholder="e.g. 204"
            value={formData.room}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Complaint Type</label>
          <div className="radio-group">
            {['Electricity Issue', 'Water Issue', 'WiFi Issue', 'Room Change Request', 'Others'].map((type) => (
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
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            name="description"
            rows="4"
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

        {error && (
          <p className="error-msg">Please fill in all required fields.</p>
        )}

        <button type="submit" className="btn btn-submit">Submit Complaint</button>
      </form>
    </div>
  )
}

export default ComplaintForm
