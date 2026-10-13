const mongoose = require('mongoose')
const { COMPLAINT_TYPES, COMPLAINT_STATUSES, LIMITS } = require('../lib/constants')

const complaintSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    maxlength: LIMITS.name
  },
  reg: {
    type: String,
    maxlength: LIMITS.regNumber,
    default: ''
  },
  hostelType: {
    type: String,
    required: true
  },
  block: {
    type: String,
    required: true
  },
  room: {
    type: String,
    required: true,
    trim: true,
    maxlength: LIMITS.room
  },
  complaintType: {
    type: String,
    enum: COMPLAINT_TYPES,
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: LIMITS.description
  },
  urgent: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: COMPLAINT_STATUSES,
    default: 'Pending'
  },
  resolvedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true })

// Match the two list queries: a student's own complaints (newest first) and
// the warden view (urgent first, then newest)
complaintSchema.index({ studentId: 1, createdAt: -1 })
complaintSchema.index({ urgent: -1, createdAt: -1 })

module.exports = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema)
