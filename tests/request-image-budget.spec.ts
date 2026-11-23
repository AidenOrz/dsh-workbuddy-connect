/**
 * Regression guard for the 0.2.2+ hand-assembled profile (see
 * REQUEST_IMAGE_BUDGETS in src/adapter.ts).
 *
 * The plugin bypasses the host's `resolveProfiles()` and builds
 * `ResolvedPiAiProviderProfile` itself, so every field the host later defaults
 * must be present here. `resolveImageRequestBudget` divides
 * `maxRequestImageBytes` by `requestImageBudgetCount`; when the divisor was
 * missing the per-image budget became `NaN`, the host's `maxImageBytes < 1`
 * guard ignored it, and every image-bearing request failed in the attachment
 * layer with `INVALID_ATTACHMENT_REF` (`Image request maxImageBytes must be a
 * positive integer.`).
 */
import { describe, expect, it } from 'vitest'
import { REQUEST_IMAGE_BUDGETS } from '../src/adapter.ts'

const BUDGET_KEYS = [
  'maxRequestImageBytes',
  'requestImageBudgetCount',
  'maxRequestImages',
  'imageOffloadCountQuantum',
  'requestImagePixelBudget',
  'requestImageMaxBytes',
  'maxImageBytes',
] as const

describe('image-request budgets', () => {
  it.each(BUDGET_KEYS)('%s is a positive safe integer', (key) => {
    expect(Number.isSafeInteger(REQUEST_IMAGE_BUDGETS[key])).toBe(true)
    expect(REQUEST_IMAGE_BUDGETS[key]).toBeGreaterThan(0)
  })

  it('derives the same per-image byte budget the host does', () => {
    const allocatedBytes = Math.floor(
      REQUEST_IMAGE_BUDGETS.maxRequestImageBytes / REQUEST_IMAGE_BUDGETS.requestImageBudgetCount / 4,
    ) * 3
    expect(Number.isSafeInteger(allocatedBytes)).toBe(true)
    expect(allocatedBytes).toBeGreaterThan(0)
    expect(Math.min(allocatedBytes, REQUEST_IMAGE_BUDGETS.maxImageBytes)).toBeGreaterThan(0)
  })

  it('satisfies the host profile invariants', () => {
    // 0.2.3: requestImageBudgetCount must allow four base64 bytes per allocation.
    expect(REQUEST_IMAGE_BUDGETS.requestImageBudgetCount).toBeLessThanOrEqual(
      Math.floor(REQUEST_IMAGE_BUDGETS.maxRequestImageBytes / 4),
    )
    // 0.2.3: the count-overflow offload step must not exceed the retained-image bound.
    expect(REQUEST_IMAGE_BUDGETS.imageOffloadCountQuantum).toBeLessThanOrEqual(
      REQUEST_IMAGE_BUDGETS.maxRequestImages,
    )
  })
})
