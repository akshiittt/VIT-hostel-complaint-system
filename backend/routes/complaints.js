const express = require('express')
const mongoose = require('mongoose')
const Complaint = require('../models/Complaint')
const { protect, allowRoles, requirePasswordChanged } = require('../middleware/auth')
const { COMPLAINT_TYPES, COMPLAINT_STATUSES, LIMITS, isValidBlock } = require('../lib/constants')
const { isBlank, tooLongMessage } = require('../lib/validation')

const router = express.Router()

router.post('/', protect, requirePasswordChanged, allowRoles('student'), async (req, res) => {
  const { hostelType, block, room, complaintType, description, urgent } = req.body || {}

  if ([hostelType, block, room, complaintType, description].some(isBlank)) {
    return res.status(400).json({ message: 'Please fill in all required fields' })
  }
  if (!isValidBlock(hostelType, block)) {
    return res.status(400).json({ message: 'Please choose a valid hostel and block' })
  }
  if (!COMPLAINT_TYPES.includes(complaintType)) {
    return res.status(400).json({ message: 'Please choose a valid complaint type' })
  }
  const tooLong = tooLongMessage([
    ['Room', room, LIMITS.room],
    ['Description', description, LIMITS.description]
  ])
  if (tooLong) {
    return res.status(400).json({ message: tooLong })
  }

  const complaint = await Complaint.create({
    studentId: req.user._id,
    name: req.user.name,
    reg: req.user.regNumber,
    hostelType,
    block,
    room,
    complaintType,
    description,
    urgent: urgent === true
  })

  res.status(201).json(complaint)
})

router.get('/mine', protect, requirePasswordChanged, allowRoles('student'), async (req, res) => {
  const complaints = await Complaint.find({ studentId: req.user._id }).sort({ createdAt: -1 })
  res.json(complaints)
})

// Warden list filters. 'open' means anything not yet Completed.
const STATUS_FILTERS = {
  all: {},
  open: { status: { $ne: 'Completed' } },
  ...Object.fromEntries(COMPLAINT_STATUSES.map((status) => [status, { status }]))
}
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
// Keeps skip well inside what MongoDB accepts for absurd ?page= values
const MAX_PAGE = 1000000

// Integer query param, or fallback if missing or not a number
function intParam(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) ? n : fallback
}

router.get('/', protect, requirePasswordChanged, allowRoles('warden'), async (req, res) => {
  const status = req.query.status ?? 'all'
  if (typeof status !== 'string' || !Object.hasOwn(STATUS_FILTERS, status)) {
    return res.status(400).json({ message: 'Invalid status filter' })
  }
  const filter = STATUS_FILTERS[status]

  let page = intParam(req.query.page, 1)
  if (page < 1) page = 1
  if (page > MAX_PAGE) page = MAX_PAGE
  const limit = Math.min(MAX_LIMIT, Math.max(1, intParam(req.query.limit, DEFAULT_LIMIT)))

  const [complaints, total, overall, open, completed] = await Promise.all([
    Complaint.find(filter).sort({ urgent: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Complaint.countDocuments(filter),
    Complaint.countDocuments(),
    Complaint.countDocuments(STATUS_FILTERS.open),
    Complaint.countDocuments({ status: 'Completed' })
  ])

  res.json({
    complaints,
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    // Over all complaints regardless of the filter, for the stat boxes
    counts: { total: overall, open, completed }
  })
})

router.patch('/:id', protect, requirePasswordChanged, allowRoles('warden'), async (req, res) => {
  const { status } = req.body || {}

  if (!COMPLAINT_STATUSES.includes(status)) {
    return res.status(400).json({ message: `Status must be one of: ${COMPLAINT_STATUSES.join(', ')}` })
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Complaint not found' })
  }

  const complaint = await Complaint.findById(req.params.id)
  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found' })
  }

  // resolvedAt records when the complaint first became Completed; re-saving
  // Completed keeps the original time, any other status clears it.
  if (status !== 'Completed') {
    complaint.resolvedAt = null
  } else if (complaint.status !== 'Completed') {
    complaint.resolvedAt = new Date()
  }
  complaint.status = status
  // Only validate status/resolvedAt so older complaints that predate newer
  // length limits can still be updated
  await complaint.save({ validateModifiedOnly: true })

  res.json(complaint)
})

module.exports = router
