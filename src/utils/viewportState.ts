export type LayoutViewportMeasurement = {
  previousHeight: number
  previousWidth: number
  currentHeight: number
  currentWidth: number
}

export function resolveLayoutViewportHeight(measurement: LayoutViewportMeasurement): number {
  const widthChanged = measurement.previousWidth > 0
    && measurement.currentWidth !== measurement.previousWidth
  return widthChanged
    ? measurement.currentHeight
    : Math.max(measurement.previousHeight, measurement.currentHeight)
}
