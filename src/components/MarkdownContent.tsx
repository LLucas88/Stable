import { Fragment, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ConversationPreviewTarget } from '../shared/conversation-preview'
function markdownTableCells(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

function isMarkdownTableStart(lines: string[], index: number) {
  if (!lines[index]?.includes('|') || !lines[index + 1]?.includes('|')) return false
  const separators = markdownTableCells(lines[index + 1])
  return separators.length > 1 && separators.every((cell) => /^:?-{3,}:?$/.test(cell))
}

type PreviewOpener = (target: Omit<ConversationPreviewTarget, 'requestId'>) => void

function markdownTableSource(headers: string[], separators: string[], rows: string[][]) {
  const cell = (value: string) => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const line = (values: string[]) => `| ${values.map(cell).join(' | ')} |`
  return [line(headers), line(separators), ...rows.map((row) => line(headers.map((_, index) => row[index] || '')))].join('\n')
}

function MarkdownTable({ headers, separators, alignments, rows, tableIndex, onPreview }: { headers: string[]; separators: string[]; alignments: Array<'left' | 'center' | 'right'>; rows: string[][]; tableIndex: number; onPreview?: PreviewOpener }) {
  const [copied, setCopied] = useState(false)
  async function copyTable() {
    await window.stable.clipboard.writeText(markdownTableSource(headers, separators, rows))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }
  return <div className="markdown-table-shell">
    <button className="markdown-table-copy" type="button" onClick={() => void copyTable()} aria-label={copied ? '表格已复制' : '复制表格'} title={copied ? '已复制' : '复制表格'}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
    <div className="markdown-table-wrap"><table><thead><tr>{headers.map((cell, cellIndex) => <th style={{ textAlign: alignments[cellIndex] || 'left' }} key={cellIndex}>{renderInline(cell, `table-head-${tableIndex}-${cellIndex}`, onPreview)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td style={{ textAlign: alignments[cellIndex] || 'left' }} key={cellIndex}>{renderInline(row[cellIndex] || '', `table-${tableIndex}-${rowIndex}-${cellIndex}`, onPreview)}</td>)}</tr>)}</tbody></table></div>
  </div>
}

export function MarkdownContent({ content, onPreview }: { content: string; onPreview?: PreviewOpener }) {
  const lines = content.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) { code.push(lines[index]); index += 1 }
      index += 1
      blocks.push(<div className="code-block" key={`code-${index}`}><div className="code-label">{language || 'code'}</div><pre><code>{code.join('\n')}</code></pre></div>)
      continue
    }
    if (isMarkdownTableStart(lines, index)) {
      const headers = markdownTableCells(line)
      const separators = markdownTableCells(lines[index + 1])
      const alignments = separators.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left') as Array<'left' | 'center' | 'right'>
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) { rows.push(markdownTableCells(lines[index])); index += 1 }
      blocks.push(<MarkdownTable headers={headers} separators={separators} alignments={alignments} rows={rows} tableIndex={index} onPreview={onPreview} key={`table-${index}`} />)
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const children = renderInline(heading[2], `heading-${index}`, onPreview)
      blocks.push(level === 1 ? <h2 key={`h-${index}`}>{children}</h2> : level === 2 ? <h3 key={`h-${index}`}>{children}</h3> : <h4 key={`h-${index}`}>{children}</h4>)
      index += 1; continue
    }
    const bullet = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/)
    if (bullet) {
      const ordered = /\d+\./.test(bullet[1])
      const entries: string[] = []
      while (index < lines.length) {
        const match = lines[index].match(/^\s*([-*]|\d+\.)\s+(.+)$/)
        if (!match || /\d+\./.test(match[1]) !== ordered) break
        entries.push(match[2]); index += 1
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={`list-${index}`}>{entries.map((entry, itemIndex) => <li key={itemIndex}>{renderInline(entry, `list-${index}-${itemIndex}`, onPreview)}</li>)}</List>)
      continue
    }
    if (line.trimStart().startsWith('> ')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trimStart().startsWith('> ')) { quote.push(lines[index].trimStart().slice(2)); index += 1 }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join(' '), `quote-${index}`, onPreview)}</blockquote>)
      continue
    }
    const paragraph: string[] = [line.trim()]
    index += 1
    while (index < lines.length && lines[index].trim() && !isMarkdownTableStart(lines, index) && !/^(#{1,3})\s+|^\s*([-*]|\d+\.)\s+|^\s*>\s+|^\s*```/.test(lines[index])) { paragraph.push(lines[index].trim()); index += 1 }
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(' '), `p-${index}`, onPreview)}</p>)
  }
  return <div className="markdown-body">{blocks}</div>
}

export function renderInline(text: string, keyPrefix: string, onPreview?: PreviewOpener): ReactNode[] {
  const token = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/[^)\s]+|[A-Za-z]:[\\/][^)\r\n<>|"?*]+?\.[A-Za-z0-9]{1,15})\)|https?:\/\/[^\s<]+|[A-Za-z]:[\\/][^\r\n<>|"?*]+?\.[A-Za-z0-9]{1,15}(?=$|[\s`)\]}，。；、]))/gi
  return text.split(token).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\((.+)\)$/)
    if (link && /^https?:\/\//i.test(link[2])) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'web', value: link[2], title: link[1] })} key={`${keyPrefix}-${index}`}>{link[1]}</button>
      : <a href={link[2]} target="_blank" rel="noreferrer" key={`${keyPrefix}-${index}`}>{link[1]}</a>
    if (link && /^[A-Za-z]:[\\/].*\.[A-Za-z0-9]{1,15}$/i.test(link[2])) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'file', value: link[2], title: link[1] })} key={`${keyPrefix}-${index}`}>{link[1]}</button>
      : <Fragment key={`${keyPrefix}-${index}`}>{link[1]}</Fragment>
    if (/^https?:\/\//i.test(part)) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'web', value: part, title: new URL(part).hostname })} key={`${keyPrefix}-${index}`}>{part}</button>
      : <a href={part} target="_blank" rel="noreferrer" key={`${keyPrefix}-${index}`}>{part}</a>
    if (/^[A-Za-z]:[\\/].*\.[A-Za-z0-9]{1,15}$/i.test(part) && onPreview) return <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'file', value: part, title: part.split(/[/\\]/).pop() || '文件' })} key={`${keyPrefix}-${index}`}>{part}</button>
    return <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>
  })
}
