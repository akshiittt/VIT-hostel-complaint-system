import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComplaintForm from './ComplaintForm'

const student = {
  _id: 'u1',
  name: 'Asha Rao',
  regNumber: '23BCE1234',
  role: 'student',
  hostelType: "Men's Hostel",
  block: 'C',
  room: '204'
}

function typeRadio(name) {
  return within(screen.getByRole('group', { name: 'Complaint Type' })).getByRole('radio', { name })
}

describe('ComplaintForm', () => {
  it("prefills hostel, block and room from the user's profile", () => {
    render(<ComplaintForm user={student} addComplaint={vi.fn()} />)

    expect(screen.getByLabelText('Hostel Type')).toHaveValue("Men's Hostel")
    expect(screen.getByLabelText('Hostel Block')).toHaveValue('C')
    expect(screen.getByLabelText('Room Number')).toHaveValue('204')
  })

  it('requires a complaint type before calling addComplaint', async () => {
    const addComplaint = vi.fn()
    const user = userEvent.setup()
    render(<ComplaintForm user={student} addComplaint={addComplaint} />)

    await user.type(screen.getByLabelText('Description'), 'Fan not working')
    await user.click(screen.getByRole('button', { name: 'Submit Complaint' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Please fill in all required fields.')
    expect(addComplaint).not.toHaveBeenCalled()
  })

  it('submits the complaint, then clears type/description/urgent and shows success', async () => {
    const addComplaint = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<ComplaintForm user={student} addComplaint={addComplaint} />)

    await user.click(typeRadio('WiFi Issue'))
    await user.type(screen.getByLabelText('Description'), 'No signal in room')
    await user.click(screen.getByRole('checkbox', { name: 'Mark as Urgent' }))
    await user.click(screen.getByRole('button', { name: 'Submit Complaint' }))

    expect(addComplaint).toHaveBeenCalledTimes(1)
    expect(addComplaint).toHaveBeenCalledWith({
      hostelType: "Men's Hostel",
      block: 'C',
      room: '204',
      complaintType: 'WiFi Issue',
      description: 'No signal in room',
      urgent: true
    })

    expect(await screen.findByRole('status')).toHaveTextContent('Complaint submitted.')
    expect(typeRadio('WiFi Issue')).not.toBeChecked()
    expect(screen.getByLabelText('Description')).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: 'Mark as Urgent' })).not.toBeChecked()
    // location is kept for the next complaint
    expect(screen.getByLabelText('Room Number')).toHaveValue('204')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the error message when addComplaint rejects', async () => {
    const addComplaint = vi.fn().mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    render(<ComplaintForm user={student} addComplaint={addComplaint} />)

    await user.click(typeRadio('Water Issue'))
    await user.type(screen.getByLabelText('Description'), 'Leaking tap')
    await user.click(screen.getByRole('button', { name: 'Submit Complaint' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // input is kept so the student can retry
    expect(screen.getByLabelText('Description')).toHaveValue('Leaking tap')
    expect(screen.getByRole('button', { name: 'Submit Complaint' })).toBeEnabled()
  })
})
