const mongoose = require('mongoose')
const { HOSTEL_BLOCKS, COMPLAINT_TYPES, COMPLAINT_STATUSES, LIMITS, isValidBlock } = require('../lib/constants')

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
    enum: Object.keys(HOSTEL_BLOCKS),
    required: true
  },
  // Must be one of the chosen hostel's blocks (routes check this too)
  block: {
    type: String,
    required: true,
    validate: {
      validator(value) {
        return isValidBlock(this.hostelType, value)
      },
      message: (props) => `Invalid block "${props.value}" for this hostel`
    }
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
  },
  // Every status change: what it became, which warden, when. Older complaints
  // without this field read as [] and gain entries on their next change.
  statusHistory: {
    type: [{
      _id: false,
      status: { type: String, enum: COMPLAINT_STATUSES, required: true },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      at: { type: Date, required: true }
    }],
    default: []
  }
}, {
  timestamps: true,
  toJSON: { versionKey: false },
  // save() fails with a VersionError if someone else saved the document since
  // it was loaded, so concurrent status changes can't silently overwrite
  // each other (app.js turns it into 409)
  optimisticConcurrency: true
})

// Match the two list queries: a student's own complaints (newest first) and
// the warden view (urgent first, then newest)
complaintSchema.index({ studentId: 1, createdAt: -1 })
complaintSchema.index({ urgent: -1, createdAt: -1 })
// The warden status filter (same sort) and the Open/Completed stat counts
complaintSchema.index({ status: 1, urgent: -1, createdAt: -1 })

module.exports = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema)
