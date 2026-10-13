import { describe, it, expect, vi } from 'vitest'
import { apiRequest, REQUEST_TIMEOUT_MS } from './api'

describe('apiRequest', () => {
  it('gives up with a friendly message when the server hangs', async () => {
    vi.useFakeTimers()
    try {
      // A fetch that never answers, but honours the abort signal like the real one
      vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })))
      const request = apiRequest('/api/auth/me')
      const assertion = expect(request).rejects.toThrow('The server took too long to respond. Please try again.')
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('still reports an unreachable server as before', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(apiRequest('/api/auth/me')).rejects.toThrow('Cannot reach the server. Check your connection and try again.')
  })
})
