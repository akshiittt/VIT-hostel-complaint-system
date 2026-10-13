import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StudentDashboard from './StudentDashboard'

const student = {
  _id: 'u1', name: 'Asha Rao', regNumber: '23BCE1234', email: 'asha@vitstudent.ac.in', role: 'student',
  hostelType: "Men's Hostel", block: 'C', room: '204'
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function renderDashboard(props = {}) {
  const handlers = {
    addComplaint: vi.fn(),
    onRefresh: vi.fn(),
    onLogout: vi.fn(),
    onSessionExpired: vi.fn(),
    onPasswordChanged: vi.fn()
  }
  render(<StudentDashboard user={student} complaints={[]} loading={false} loadError="" {...handlers} {...props} />)
  return handlers
}

async function changePassword(user) {
  await user.type(screen.getByLabelText('Current password'), 'old-password')
  await user.type(screen.getByLabelText('New password'), 'new-password')
  await user.type(screen.getByLabelText('Confirm new password'), 'new-password')
  await user.click(screen.getByRole('button', { name: 'Update password' }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('StudentDashboard', () => {
  it('shows the student topbar, the complaint form and the list inside main', () => {
    renderDashboard()
    expect(screen.getByText('Student')).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Submit a Complaint' }))
    expect(screen.getByRole('heading', { name: 'My Complaints' })).toBeInTheDocument()
  })

  it('toggles the change-password panel from the topbar', async () => {
    const user = userEvent.setup()
    renderDashboard()
    const toggle = screen.getByRole('button', { name: 'Change password' })

    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    await user.click(toggle)
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the panel with Cancel', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  })

  it('shows "Password changed." after a change and hides it after 4 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const response = { token: 'new-token', user: student }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, response)))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onPasswordChanged } = renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await changePassword(user)

    expect(await screen.findByRole('status')).toHaveTextContent('Password changed.')
    expect(onPasswordChanged).toHaveBeenCalledWith(response)
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(3900) })
    expect(screen.getByText('Password changed.')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.queryByText('Password changed.')).not.toBeInTheDocument()
  })

  it('hides "Password changed." straight away when the panel is opened again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { token: 'new-token', user: student })))
    const user = userEvent.setup()
    renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await changePassword(user)
    await screen.findByText('Password changed.')

    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.queryByText('Password changed.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
  })

  it('passes a 401 from the password form to onSessionExpired', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'Session expired' })))
    const user = userEvent.setup()
    const { onSessionExpired, onPasswordChanged } = renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await changePassword(user)

    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
    expect(onPasswordChanged).not.toHaveBeenCalled()
  })

  it('wires Logout and Refresh to the callbacks', async () => {
    const user = userEvent.setup()
    const { onLogout, onRefresh } = renderDashboard()
    await user.click(screen.getByRole('button', { name: 'Logout' }))
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
