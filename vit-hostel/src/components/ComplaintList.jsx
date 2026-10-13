import { useState } from 'react'
import ComplaintCard from './ComplaintCard'
import { COMPLAINT_TYPES } from '../constants'

function ComplaintList({ complaints, loading, loadError, onRefresh }) {
  const [filter, setFilter] = useState('All')

  function getFilteredComplaints() {
    if (filter === 'All') return complaints
    return complaints.filter((c) => c.complaintType === filter)
  }

  const filtered = getFilteredComplaints()

  return (
    <div className="panel-card">
      <div className="complaints-header">
        <h2 className="panel-heading">
          My Complaints
          <button type="button" className="refresh-btn" onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </h2>
        <div className="filter-group">
          <label htmlFor="complaint-filter">Filter by:</label>
          <select id="complaint-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="All">All</option>
            {COMPLAINT_TYPES.map((type) => (
              <option key={type} value={type}>{type.replace(/ (Issue|Request)$/, '')}</option>
            ))}
          </select>
        </div>
      </div>

      {loadError && <p className="error-msg" role="alert">{loadError}</p>}

      {loading && complaints.length === 0 ? (
        <p className="empty-msg">Loading complaints…</p>
      ) : filtered.length === 0 ? (
        <p className="empty-msg">No complaints found.</p>
      ) : (
        filtered.map((complaint) => (
          <ComplaintCard
            key={complaint._id}
            complaint={complaint}
            showActions={false}
          />
        ))
      )}
    </div>
  )
}

export default ComplaintList
