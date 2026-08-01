import { describe, expect, it } from 'vitest'

import { getStatusColor } from '../utils'

import { formatTime } from './HistoryPanel'

describe('getStatusColor (from utils)', () => {
  it('returns success for 2xx', () => {
    expect(getStatusColor(200)).toBe('success')
    expect(getStatusColor(201)).toBe('success')
    expect(getStatusColor(299)).toBe('success')
  })

  it('returns processing for 3xx', () => {
    expect(getStatusColor(301)).toBe('processing')
    expect(getStatusColor(304)).toBe('processing')
    expect(getStatusColor(399)).toBe('processing')
  })

  it('returns warning for 4xx', () => {
    expect(getStatusColor(400)).toBe('warning')
    expect(getStatusColor(404)).toBe('warning')
    expect(getStatusColor(499)).toBe('warning')
  })

  it('returns error for 5xx', () => {
    expect(getStatusColor(500)).toBe('error')
    expect(getStatusColor(502)).toBe('error')
    expect(getStatusColor(599)).toBe('error')
  })

  it('returns error for 0 (network error)', () => {
    expect(getStatusColor(0)).toBe('error')
  })

  it('returns success for 1xx', () => {
    expect(getStatusColor(100)).toBe('success')
  })
})

describe('formatTime', () => {
  it('formats ISO date string to locale string', () => {
    const result = formatTime('2024-01-15T10:30:45Z')
    expect(result).toBeTruthy()
    expect(result).not.toBe('2024-01-15T10:30:45Z')
  })

  it('returns "Invalid Date" for non-date string (no throw)', () => {
    expect(() => formatTime('not-a-date')).not.toThrow()
  })

  it('handles empty string without throwing', () => {
    expect(() => formatTime('')).not.toThrow()
  })
})
