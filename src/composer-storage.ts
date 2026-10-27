import { useEffect, useState } from 'react'

export function readComposerValue<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
export function writeComposerValue(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); return '' }
  catch { return '草稿恢复记录未能保存，请保留当前窗口并复制重要内容后重试。' }
}
export function useComposerValue<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readComposerValue(key, fallback))
  const [error, setError] = useState('')
  useEffect(() => { setError(writeComposerValue(key, value)) }, [key, value])
  return [value, setValue, error] as const
}
