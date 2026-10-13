import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePasswordForm from './ChangePasswordForm'

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function stubFetch(impl) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function fillForm(user, { current = 'oldpass1', next = 'newpass1', confirm = next } = {}) {
  await user.type(screen.getByLabelText('Current password'), current)
  await user.type(screen.getByLabelText('New password'), next)
  await user.type(screen.getByLabelText('Confirm new password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Update password' }))
}

describe('ChangePasswordForm', () => {
  it('rejects mismatched passwords without a request', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}))
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<ChangePasswordForm onChanged={onChanged} />)

    await fillForm(user, { next: 'newpass1', confirm: 'newpass2' })

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('POSTs the passwords and passes the response to onChanged', async () => {
    const body = { token: 'new-token', user: { _id: 'u1', role: 'student', mustChangePassword: false } }
    const fetchMock = stubFetch(async () => jsonResponse(200, body))
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<ChangePasswordForm onChanged={onChanged} />)

    await fillForm(user)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/auth\/change-password$/)
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ currentPassword: 'oldpass1', newPassword: 'newpass1' })
    expect(onChanged).toHaveBeenCalledWith(body)
  })

  it('shows the server message when the current password is wrong', async () => {
    stubFetch(async () => jsonResponse(400, { message: 'Current password is incorrect' }))
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<ChangePasswordForm onChanged={onChanged} />)

    await fillForm(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect')
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled()
  })

  it('shows Cancel only when onCancel is given', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<ChangePasswordForm onChanged={vi.fn()} forced />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()

    rerender(<ChangePasswordForm onChanged={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('tells a student when the warden reset their password', () => {
    render(<ChangePasswordForm forced resetAt="2026-10-13T09:30:00.000Z" onChanged={vi.fn()} />)
    expect(screen.getByText(/Your password was reset by the warden on 13 Oct 2026/)).toBeInTheDocument()
  })

  it('rejects a new password under 8 characters without a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<ChangePasswordForm onChanged={vi.fn()} />)

    await user.type(screen.getByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'short12')
    await user.type(screen.getByLabelText('Confirm new password'), 'short12')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(screen.getByRole('alert')).toHaveTextContent('New password must be at least 8 characters.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
