import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResetPasswordPanel from './ResetPasswordPanel'

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function stubFetch(impl) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ResetPasswordPanel', () => {
  it('shows the temporary password, and hides it when the email changes', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { email: 'asha@vitstudent.ac.in', temporaryPassword: 'Tmp-9xQ2' }))
    const user = userEvent.setup()
    render(<ResetPasswordPanel />)

    await user.type(screen.getByLabelText('Student email'), 'asha@vitstudent.ac.in')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Temporary password for asha@vitstudent.ac.in: Tmp-9xQ2')
    expect(status).toHaveTextContent("It won't be shown again.")
    expect(screen.getByText('Tmp-9xQ2').tagName).toBe('CODE')

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/auth\/reset-password$/)
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ email: 'asha@vitstudent.ac.in' })

    await user.type(screen.getByLabelText('Student email'), 'x')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the server message for an unknown student', async () => {
    stubFetch(async () => jsonResponse(404, { message: 'No student account with that email' }))
    const user = userEvent.setup()
    render(<ResetPasswordPanel />)

    await user.type(screen.getByLabelText('Student email'), 'nobody@vitstudent.ac.in')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No student account with that email')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
