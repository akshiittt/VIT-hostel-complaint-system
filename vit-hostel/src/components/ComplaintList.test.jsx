import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComplaintList from './ComplaintList'

function complaint(id, complaintType, description) {
  return {
    _id: id, name: 'Asha Rao', reg: '23BCE1234', hostelType: "Men's Hostel", block: 'C', room: '204',
    complaintType, description, urgent: false, status: 'Pending', createdAt: '2026-10-01T10:00:00.000Z'
  }
}

const complaints = [
  complaint('c1', 'WiFi Issue', 'WiFi drops at night'),
  complaint('c2', 'Water Issue', 'Tap is leaking'),
  complaint('c3', 'Others', 'Door hinge is loose')
]

function renderList(props = {}) {
  const onRefresh = vi.fn()
  render(<ComplaintList complaints={complaints} loading={false} loadError="" onRefresh={onRefresh} {...props} />)
  return { onRefresh }
}

describe('ComplaintList', () => {
  it('shows every complaint under "All"', () => {
    renderList()
    expect(screen.getByLabelText('Filter by:')).toHaveValue('All')
    for (const c of complaints) expect(screen.getByText(c.description)).toBeInTheDocument()
  })

  it('filters by complaint type using short option labels', async () => {
    const user = userEvent.setup()
    renderList()

    await user.selectOptions(screen.getByLabelText('Filter by:'), 'WiFi')
    expect(screen.getByText('WiFi drops at night')).toBeInTheDocument()
    expect(screen.queryByText('Tap is leaking')).not.toBeInTheDocument()
    expect(screen.queryByText('Door hinge is loose')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filter by:'), 'Others')
    expect(screen.getByText('Door hinge is loose')).toBeInTheDocument()
    expect(screen.queryByText('WiFi drops at night')).not.toBeInTheDocument()
  })

  it('says nothing was found when a filter matches no complaint', async () => {
    const user = userEvent.setup()
    renderList()
    await user.selectOptions(screen.getByLabelText('Filter by:'), 'Room Change')
    expect(screen.getByText('No complaints found.')).toBeInTheDocument()
  })

  it('shows the empty state with no complaints', () => {
    renderList({ complaints: [] })
    expect(screen.getByText('No complaints found.')).toBeInTheDocument()
  })

  it('shows the loading state only while the list is still empty', () => {
    renderList({ complaints: [], loading: true })
    expect(screen.getByText('Loading complaints…')).toBeInTheDocument()
    expect(screen.queryByText('No complaints found.')).not.toBeInTheDocument()
  })

  it('keeps showing complaints while refreshing, with a disabled "Refreshing…" button', () => {
    renderList({ loading: true })
    expect(screen.getByText('Tap is leaking')).toBeInTheDocument()
    expect(screen.queryByText('Loading complaints…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()
  })

  it('calls onRefresh from the Refresh button', async () => {
    const { onRefresh } = renderList()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows a load error as an alert', () => {
    renderList({ loadError: 'Cannot reach the server.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.')
  })

  it('never shows warden status buttons to students', () => {
    renderList()
    expect(screen.queryByRole('button', { name: /Mark/ })).not.toBeInTheDocument()
  })
})
