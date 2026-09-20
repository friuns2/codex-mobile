import { describe, expect, it } from 'vitest'
import { resolveLayoutViewportHeight, resolveVirtualKeyboardRotationHold } from './viewportState'

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

describe('resolveVirtualKeyboardRotationHold', () => {
  it('keeps keyboard layout active when rotation occurs while an editor remains focused', () => {
    expect(resolveVirtualKeyboardRotationHold({
      previousHold: false,
      previousKeyboardOpen: true,
      widthChanged: true,
      previousVisualHeight: 552,
      currentVisualHeight: 200,
      hasKeyboardFocus: true,
    })).toBe(true)
  })

  it('does not hold keyboard layout across rotation without editable focus', () => {
    expect(resolveVirtualKeyboardRotationHold({
      previousHold: false,
      previousKeyboardOpen: true,
      widthChanged: true,
      previousVisualHeight: 552,
      currentVisualHeight: 200,
      hasKeyboardFocus: false,
    })).toBe(false)
  })

  it('clears the rotation hold when the visual viewport expands after keyboard dismissal', () => {
    expect(resolveVirtualKeyboardRotationHold({
      previousHold: true,
      previousKeyboardOpen: true,
      widthChanged: false,
      previousVisualHeight: 200,
      currentVisualHeight: 375,
      hasKeyboardFocus: true,
    })).toBe(false)
  })
})
