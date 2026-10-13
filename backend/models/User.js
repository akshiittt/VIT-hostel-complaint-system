const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const { LIMITS } = require('../lib/constants')

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: LIMITS.name
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: LIMITS.email
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['student', 'warden'],
    default: 'student'
  },
  regNumber: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: LIMITS.regNumber,
    default: ''
  },
  hostelType: {
    type: String,
    enum: ["Men's Hostel", "Women's Hostel", ''],
    default: ''
  },
  block: {
    type: String,
    trim: true,
    default: ''
  },
  room: {
    type: String,
    trim: true,
    maxlength: LIMITS.room,
    default: ''
  }
}, { timestamps: true })

// The only place passwords get hashed. Callers (routes, seed.js) must pass
// the plain password, otherwise it would be hashed twice and login would fail.
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
})

userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password)
}

userSchema.methods.toPublic = function () {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    regNumber: this.regNumber,
    hostelType: this.hostelType,
    block: this.block,
    room: this.room
  }
}

module.exports = mongoose.models.User || mongoose.model('User', userSchema)
