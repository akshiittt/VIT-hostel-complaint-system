function ComplaintCard({ complaint, index, showActions, updateComplaintStatus }) {
  const statusClass = complaint.status === 'Completed'
    ? 'badge-status-completed'
    : 'badge-status-pending'

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
      </div>

      <div className="card-desc">{complaint.description}</div>

      {showActions && (
        <div className="card-actions">
          <button
            className="btn-complete"
            onClick={() => updateComplaintStatus(index, 'Completed')}
          >
            Mark as Completed
          </button>
          <button
            className="btn-pending"
            onClick={() => updateComplaintStatus(index, 'Pending')}
          >
            Mark as Pending
          </button>
        </div>
      )}
    </div>
  )
}

export default ComplaintCard
