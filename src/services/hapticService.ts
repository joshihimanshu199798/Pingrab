export function triggerHaptic(duration = 35) {
  try {
    if (typeof window !== 'undefined' && 'navigator' in window && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  } catch {
    // Ignore if vibration is restricted or not supported
  }
}
