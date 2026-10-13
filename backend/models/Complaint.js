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
  }
}, { timestamps: true, toJSON: { versionKey: false } })

// Match the two list queries: a student's own complaints (newest first) and
// the warden view (urgent first, then newest)
complaintSchema.index({ studentId: 1, createdAt: -1 })
complaintSchema.index({ urgent: -1, createdAt: -1 })

module.exports = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema)
