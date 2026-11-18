import type { BootstrapData } from './types'
import './styles/update-notice.css'

export function UpdateNotice({ update }: { update: BootstrapData['update'] }) {
  if (!update.oneClick || !['checking', 'available', 'downloading', 'downloaded'].includes(update.status)) return null
  const downloading = update.status === 'downloading'
  const progress = Math.max(0, Math.min(100, update.progress || 0))
  return <div className="update-notice-layer"><section className="update-notice" role="status" aria-live="polite" aria-label="应用更新">
    <p>{downloading ? '正在下载更新…' : '正在准备更新…'}</p>
    <div className="update-notice-track" role="progressbar" aria-label="更新进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloading ? progress : undefined}>
      <div className="update-notice-fill" data-waiting={!downloading || undefined} style={{ width: downloading ? `${progress}%` : '28%' }} />
    </div>
  </section></div>
}
