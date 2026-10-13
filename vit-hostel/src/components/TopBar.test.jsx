import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TopBar from './TopBar'

function renderTopBar(props = {}) {
  const handlers = { onTogglePassword: vi.fn(), onLogout: vi.fn() }
  render(<TopBar role="student" showPasswordForm={false} {...handlers} {...props} />)
  return handlers
}

describe('TopBar', () => {
  it('shows the role badge from the role prop', () => {
    renderTopBar({ role: 'student' })
    expect(screen.getByText('Student')).toHaveClass('role-badge', 'student-badge')
  })

  it('shows the warden badge for wardens', () => {
    renderTopBar({ role: 'warden' })
    expect(screen.getByText('Warden')).toHaveClass('role-badge', 'warden-badge')
  })

  it('has no skip link unless skipTo is given', () => {
    renderTopBar({ role: 'student' })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders the skip link for the warden, pointing at the target id', () => {
    renderTopBar({ role: 'warden', skipTo: 'reset-password', skipLabel: "Skip to reset a student's password" })
    expect(screen.getByRole('link', { name: "Skip to reset a student's password" })).toHaveAttribute('href', '#reset-password')
  })

  it('names the password button "Change password" on every screen size and reflects whether it is open', async () => {
    const { onTogglePassword } = renderTopBar({ showPasswordForm: false })
    const button = screen.getByRole('button', { name: 'Change password' })
    expect(button).toHaveAttribute('aria-label', 'Change password')
    expect(button).toHaveAttribute('aria-expanded', 'false')

    await userEvent.setup().click(button)
    expect(onTogglePassword).toHaveBeenCalledTimes(1)
  })

  it('marks the password button expanded when the form is open', () => {
    renderTopBar({ showPasswordForm: true })
    expect(screen.getByRole('button', { name: 'Change password' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('calls onLogout from the Logout button', async () => {
    const { onLogout } = renderTopBar()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Logout' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
