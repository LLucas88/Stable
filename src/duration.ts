export function formatElapsedTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(milliseconds) ? milliseconds : 0) / 1000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (hours > 0) return `${hours}小时${minutes}分钟${seconds}秒`
  if (totalMinutes > 0) return `${totalMinutes}分钟${seconds}秒`
  return `${seconds}秒`
}
