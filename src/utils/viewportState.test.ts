import { describe, expect, it } from 'vitest'
import { resolveLayoutViewportHeight } from './viewportState'

describe('resolveLayoutViewportHeight', () => {
  it('keeps the layout height while a same-width soft keyboard shrinks the viewport', () => {
    expect(resolveLayoutViewportHeight({
      previousHeight: 812,
      previousWidth: 375,
      currentHeight: 552,
      currentWidth: 375,
    })).toBe(812)
  })

  it('resets the layout height when rotation changes the viewport width', () => {
    expect(resolveLayoutViewportHeight({
      previousHeight: 812,
      previousWidth: 375,
      currentHeight: 375,
      currentWidth: 667,
    })).toBe(375)
  })

  it('continues tracking a larger same-width layout viewport', () => {
    expect(resolveLayoutViewportHeight({
      previousHeight: 552,
      previousWidth: 375,
      currentHeight: 812,
      currentWidth: 375,
    })).toBe(812)
  })
})
