// User-level steps for the journeys. Everything goes through labels and roles,
// like a person using the page; nothing calls component internals.
import { screen, waitFor } from '@testing-library/react'
import { expect } from 'vitest'

export async function signUp(user, data) {
  await user.click(await screen.findByRole('button', { name: 'Create an account' }))
  if (data.name) await user.type(screen.getByLabelText('Full Name'), data.name)
  if (data.regNumber) await user.type(screen.getByLabelText('Registration Number'), data.regNumber)
  if (data.email) await user.type(screen.getByLabelText('Email'), data.email)
  if (data.password) await user.type(screen.getByLabelText('Password'), data.password)
  if (data.hostelType) await user.selectOptions(screen.getByLabelText('Hostel Type'), data.hostelType)
  if (data.block) await user.selectOptions(screen.getByLabelText('Hostel Block'), data.block)
  if (data.room) await user.type(screen.getByLabelText('Room Number'), data.room)
  await user.click(screen.getByRole('button', { name: 'Create Account' }))
}

export async function logIn(user, email, password) {
  const emailField = await screen.findByLabelText('Email')
  await user.clear(emailField)
  await user.type(emailField, email)
  await user.clear(screen.getByLabelText('Password'))
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Login' }))
}

// The form is prefilled with the student's hostel, block and room
export async function submitComplaint(user, { type = 'Water Issue', description }) {
  await user.click(await screen.findByRole('radio', { name: type }))
  const field = screen.getByLabelText('Description')
  await user.clear(field)
  await user.type(field, description)
  await user.click(screen.getByRole('button', { name: 'Submit Complaint' }))
}

// Waits for a complaints load to start and finish. Right after login the
// dashboard renders one frame with an empty list before its first request
// starts, so "No complaints found." alone doesn't prove the list has loaded.
// waitFor re-checks on every DOM change, so the brief "Refreshing…" (disabled)
// state is seen even when the request is fast.
export async function waitForListLoaded() {
  let sawLoading = false
  await waitFor(() => {
    const button = screen.getByRole('button', { name: /^Refresh/ })
    if (button.disabled) sawLoading = true
    expect(sawLoading && !button.disabled).toBe(true)
  })
}
