export type LayoutViewportMeasurement = {
  previousHeight: number
  previousWidth: number
  currentHeight: number
  currentWidth: number
}

export type VirtualKeyboardRotationHoldMeasurement = {
  previousHold: boolean
  previousKeyboardOpen: boolean
  widthChanged: boolean
  previousVisualHeight: number
  currentVisualHeight: number
  hasKeyboardFocus: boolean
}

export function resolveLayoutViewportHeight(measurement: LayoutViewportMeasurement): number {
  const widthChanged = measurement.previousWidth > 0
    && measurement.currentWidth !== measurement.previousWidth
  return widthChanged
    ? measurement.currentHeight
    : Math.max(measurement.previousHeight, measurement.currentHeight)
}

export function resolveVirtualKeyboardRotationHold(
  measurement: VirtualKeyboardRotationHoldMeasurement,
): boolean {
  if (measurement.widthChanged && measurement.previousKeyboardOpen && measurement.hasKeyboardFocus) {
    return true
  }
  if (!measurement.previousHold || !measurement.hasKeyboardFocus) return false
  return measurement.currentVisualHeight - measurement.previousVisualHeight <= 120
}
