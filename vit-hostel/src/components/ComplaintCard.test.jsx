import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComplaintCard from './ComplaintCard'

function makeComplaint(overrides = {}) {
  return {
    _id: 'c1',
    name: 'Asha Rao',
    reg: '23BCE1234',
    hostelType: "Men's Hostel",
    block: 'C',
    room: '204',
    complaintType: 'WiFi Issue',
    description: 'No signal',
    urgent: false,
    status: 'Pending',
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides
  }
}

describe('ComplaintCard warden actions', () => {
  it('disables "Mark as Completed" when completed and marks it pending on click', async () => {
    const updateComplaintStatus = vi.fn()
    const user = userEvent.setup()
    render(
      <ComplaintCard
        complaint={makeComplaint({ status: 'Completed' })}
        showActions
        updateComplaintStatus={updateComplaintStatus}
      />
    )

    expect(screen.getByRole('button', { name: 'Mark as Completed' })).toBeDisabled()
    const pending = screen.getByRole('button', { name: 'Mark as Pending' })
    expect(pending).toBeEnabled()

    await user.click(pending)

    expect(updateComplaintStatus).toHaveBeenCalledWith('c1', 'Pending')
  })

  it('disables "Mark as Pending" when pending and marks it completed on click', async () => {
    const updateComplaintStatus = vi.fn()
    const user = userEvent.setup()
    render(<ComplaintCard complaint={makeComplaint()} showActions updateComplaintStatus={updateComplaintStatus} />)

    expect(screen.getByRole('button', { name: 'Mark as Pending' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Mark as Completed' }))

    expect(updateComplaintStatus).toHaveBeenCalledWith('c1', 'Completed')
  })

  it('marks a complaint In Progress, and disables that button when it already is', async () => {
    const updateComplaintStatus = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <ComplaintCard complaint={makeComplaint()} showActions updateComplaintStatus={updateComplaintStatus} />
    )

    await user.click(screen.getByRole('button', { name: 'Mark In Progress' }))
    expect(updateComplaintStatus).toHaveBeenCalledWith('c1', 'In Progress')

    rerender(
      <ComplaintCard
        complaint={makeComplaint({ status: 'In Progress' })}
        showActions
        updateComplaintStatus={updateComplaintStatus}
      />
    )
    expect(screen.getByRole('button', { name: 'Mark In Progress' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark as Pending' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Mark as Completed' })).toBeEnabled()
    expect(screen.getByText('In Progress')).toHaveClass('badge-status-progress')
  })

  it('hides the actions for students', () => {
    render(<ComplaintCard complaint={makeComplaint()} showActions={false} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('ComplaintCard content', () => {
  it('renders a multi-line description with its newline intact', () => {
    render(<ComplaintCard complaint={makeComplaint({ description: 'Line one\nLine two' })} showActions={false} />)

    // the default matcher collapses whitespace, so check the raw text separately
    const desc = screen.getByText('Line one Line two')
    expect(desc.textContent).toBe('Line one\nLine two')
  })

  it('shows the urgent badge and the status', () => {
    render(<ComplaintCard complaint={makeComplaint({ urgent: true })} showActions={false} />)

    expect(screen.getByText('Urgent')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })
})
