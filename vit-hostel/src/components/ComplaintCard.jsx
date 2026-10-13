const STATUS_BADGES = {
  Completed: 'badge-status-completed',
  'In Progress': 'badge-status-progress'
}

function ComplaintCard({ complaint, showActions, updateComplaintStatus }) {
  const statusClass = STATUS_BADGES[complaint.status] || 'badge-status-pending'

  const submittedOn = complaint.createdAt
    ? new Date(complaint.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <div className={`complaint-card ${complaint.urgent ? 'urgent' : ''}`}>
      <div className="card-top">
        <div>
          <span className="card-name">{complaint.name}</span>
          <span className="card-reg">{complaint.reg}</span>
        </div>
        <div className="card-badges">
          <span className="badge badge-type">{complaint.complaintType}</span>
          {complaint.urgent && (
            <span className="badge badge-urgent">Urgent</span>
          )}
          <span className={`badge ${statusClass}`}>{complaint.status}</span>
        </div>
      </div>

      <div className="card-hostel">
        {complaint.hostelType} &nbsp;|&nbsp; Block {complaint.block} &nbsp;|&nbsp; Room {complaint.room}
        {submittedOn && <> &nbsp;|&nbsp; {submittedOn}</>}
      </div>

      <div className="card-desc">{complaint.description}</div>

      {showActions && (
        <div className="card-actions">
          <button
            className="btn-complete"
            disabled={complaint.status === 'Completed'}
            onClick={() => updateComplaintStatus(complaint._id, 'Completed')}
          >
            Mark as Completed
          </button>
          <button
            className="btn-progress"
            disabled={complaint.status === 'In Progress'}
            onClick={() => updateComplaintStatus(complaint._id, 'In Progress')}
          >
            Mark In Progress
          </button>
          <button
            className="btn-pending"
            disabled={complaint.status === 'Pending'}
            onClick={() => updateComplaintStatus(complaint._id, 'Pending')}
          >
            Mark as Pending
          </button>
        </div>
      )}
    </div>
  )
}

export default ComplaintCard
