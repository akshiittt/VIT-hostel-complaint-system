import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WardenPanel from './WardenPanel'

const complaint = {
  _id: 'c1', name: 'Asha Rao', reg: '23BCE1234', hostelType: "Men's Hostel", block: 'C', room: '204',
  complaintType: 'Water Issue', description: 'Tap is leaking', urgent: false, status: 'Pending',
  createdAt: '2026-10-01T10:00:00.000Z'
}

const defaultMeta = { page: 1, pages: 1, total: 1, counts: { total: 7, open: 4, completed: 3 } }

function renderPanel(props = {}) {
  const handlers = {
    onQueryChange: vi.fn(),
    onRefresh: vi.fn(),
    updateComplaintStatus: vi.fn(),
    onLogout: vi.fn(),
    onSessionExpired: vi.fn(),
    onPasswordChanged: vi.fn()
  }
  render(
    <WardenPanel
      complaints={[complaint]}
      loading={false}
      loadError=""
      actionError=""
      updatingIds={[]}
      query={{ status: 'all', page: 1 }}
      meta={defaultMeta}
      {...handlers}
      {...props}
    />
  )
  return handlers
}

function stat(label) {
  return screen.getByText(label, { selector: '.stat-box small' }).closest('.stat-box')
}

describe('WardenPanel stat boxes', () => {
  it('shows the overall counts from meta', () => {
    renderPanel()
    expect(stat('Total')).toHaveTextContent('7')
    expect(stat('Open')).toHaveTextContent('4')
    expect(stat('Completed')).toHaveTextContent('3')
  })
})

describe('WardenPanel filter', () => {
  it('asks for page 1 of the chosen status', async () => {
    const user = userEvent.setup()
    const { onQueryChange } = renderPanel({ query: { status: 'all', page: 3 }, meta: { ...defaultMeta, page: 3, pages: 5 } })

    await user.selectOptions(screen.getByLabelText('Show'), 'Completed')

    expect(onQueryChange).toHaveBeenCalledWith({ status: 'Completed', page: 1 })
  })

  it('offers every status filter', () => {
    renderPanel()
    const options = within(screen.getByLabelText('Show')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['All', 'Open', 'Pending', 'In Progress', 'Completed'])
  })

  it('uses a different empty message for a filter than for no complaints at all', () => {
    renderPanel({ complaints: [] })
    expect(screen.getByText("No complaints found. Students haven't submitted any yet.")).toBeInTheDocument()
  })

  it('says no complaint matches a filter', () => {
    renderPanel({ complaints: [], query: { status: 'open', page: 1 } })
    expect(screen.getByText('No complaints match this filter.')).toBeInTheDocument()
  })
})

describe('WardenPanel pagination', () => {
  it('is hidden when there is only one page', () => {
    renderPanel({ meta: { ...defaultMeta, pages: 1 } })
    expect(screen.queryByRole('navigation', { name: 'Complaint pages' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('disables Previous on the first page and moves to the next page', async () => {
    const user = userEvent.setup()
    const { onQueryChange } = renderPanel({ meta: { ...defaultMeta, page: 1, pages: 3 } })
    const nav = screen.getByRole('navigation', { name: 'Complaint pages' })

    expect(within(nav).getByText('Page 1 of 3')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Previous' })).toBeDisabled()
    await user.click(within(nav).getByRole('button', { name: 'Next' }))

    expect(onQueryChange).toHaveBeenCalledWith({ page: 2 })
  })

  it('disables Next on the last page and moves back', async () => {
    const user = userEvent.setup()
    const { onQueryChange } = renderPanel({ query: { status: 'all', page: 3 }, meta: { ...defaultMeta, page: 3, pages: 3 } })

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous' }))

    expect(onQueryChange).toHaveBeenCalledWith({ page: 2 })
  })

  it('enables both buttons on a middle page', () => {
    renderPanel({ query: { status: 'all', page: 2 }, meta: { ...defaultMeta, page: 2, pages: 3 } })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('disables both buttons while loading', () => {
    renderPanel({ loading: true, query: { status: 'all', page: 2 }, meta: { ...defaultMeta, page: 2, pages: 3 } })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})

describe('WardenPanel states', () => {
  it('shows the loading message only while there is nothing to show yet', () => {
    renderPanel({ complaints: [], loading: true })
    expect(screen.getByText('Loading complaints…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()
  })

  it('shows load and action errors as alerts', () => {
    renderPanel({ loadError: 'Cannot reach the server.', actionError: 'This complaint was just updated by someone else.' })
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent)
    expect(alerts).toEqual(['Cannot reach the server.', 'This complaint was just updated by someone else.'])
  })

  it('disables the actions of a card whose update is in flight', () => {
    renderPanel({ updatingIds: ['c1'] })
    expect(screen.getByRole('button', { name: 'Mark as Completed' })).toBeDisabled()
  })

  it('passes status clicks and Refresh up', async () => {
    const user = userEvent.setup()
    const { updateComplaintStatus, onRefresh } = renderPanel()
    await user.click(screen.getByRole('button', { name: 'Mark as Completed' }))
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(updateComplaintStatus).toHaveBeenCalledWith('c1', 'Completed')
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('toggles the change-password panel and includes the reset panel', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(screen.getByRole('heading', { name: "Reset a student's password" })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  })

  it('shows "Password changed." after a change, clears it on reopen, and hides it after 4 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const response = { token: 'new-token', user: { _id: 'w1', role: 'warden' } }
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => response })))
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { onPasswordChanged } = renderPanel()

      async function change() {
        await user.click(screen.getByRole('button', { name: 'Change password' }))
        await user.type(screen.getByLabelText('Current password'), 'old-password')
        await user.type(screen.getByLabelText('New password'), 'new-password')
        await user.type(screen.getByLabelText('Confirm new password'), 'new-password')
        await user.click(screen.getByRole('button', { name: 'Update password' }))
        await screen.findByText('Password changed.')
      }

      await change()
      expect(onPasswordChanged).toHaveBeenCalledWith(response)
      await user.click(screen.getByRole('button', { name: 'Change password' }))
      expect(screen.queryByText('Password changed.')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await change()
      act(() => { vi.advanceTimersByTime(3900) })
      expect(screen.getByText('Password changed.')).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(200) })
      expect(screen.queryByText('Password changed.')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
