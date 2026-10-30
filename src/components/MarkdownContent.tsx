import { createContext, Fragment, useContext, useState, type ReactNode } from 'react'
import { Check, Copy, FileText, FileCode2, Braces, FileSpreadsheet, Image, FileArchive, Presentation } from 'lucide-react'
import type { ConversationPreviewTarget } from '../shared/conversation-preview'
import { parseFileReference } from '../shared/file-reference'
import { useFileContextMenu } from './FileContextMenu'

const HideImageFiles = createContext<ReadonlySet<string> | undefined>(undefined)
const FileAvailability = createContext<ReadonlyMap<string, boolean> | undefined>(undefined)

function FileLink({ reference, onPreview }: { reference: NonNullable<ReturnType<typeof parseFileReference>>; onPreview?: PreviewOpener }) {
  const hideImageFiles = useContext(HideImageFiles)
  const available = useContext(FileAvailability)
  const disabled = !onPreview || available?.get(reference.key) === false
  const onOpen = () => onPreview?.({ kind: 'file', value: reference.path, title: reference.name })
  const fileMenu = useFileContextMenu({ path: reference.path, name: reference.name, onOpen, disabled })
  const Icon = /^(html?|jsx?|tsx?|py|css|sh|cjs|mjs)$/.test(reference.extension) ? FileCode2
    : /^(json|ya?ml|toml)$/.test(reference.extension) ? Braces
    : /^(xlsx?|csv|ods)$/.test(reference.extension) ? FileSpreadsheet
    : /^(png|jpe?g|gif|svg|webp)$/.test(reference.extension) ? Image
    : /^(pptx?|odp)$/.test(reference.extension) ? Presentation
    : /^(zip|rar|7z|tar|gz)$/.test(reference.extension) ? FileArchive : FileText
  if(hideImageFiles?.has(reference.key))return null
  return <><button className="markdown-file-link" type="button" disabled={disabled} title={`${reference.reference}${disabled ? '（文件不可用）' : ''}`} onClick={onOpen} {...fileMenu.handlers}><Icon size={15} aria-hidden="true" /><span>{reference.label}</span></button>{fileMenu.menu}{fileMenu.error}</>
}
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

export function MarkdownContent({ content, onPreview, fileAvailability, hideImageFiles }: { hideImageFiles?:ReadonlySet<string>; content: string; onPreview?: PreviewOpener; fileAvailability?: ReadonlyMap<string, boolean> }) {
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
  return <HideImageFiles.Provider value={hideImageFiles}><FileAvailability.Provider value={fileAvailability}><div className="markdown-body">{blocks}</div></FileAvailability.Provider></HideImageFiles.Provider>
}

export function renderInline(text: string, keyPrefix: string, onPreview?: PreviewOpener): ReactNode[] {
  const token = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:<[^>\r\n]+>|(?:https?:\/\/[^)\s]+|(?:file:\/\/\/)?[A-Za-z]:[\\/][^\r\n<>|"?*]+?\.[A-Za-z0-9]{1,15}(?::\d+(?::\d+)?|#L\d+(?:C\d+)?)?|\/[^\r\n<>|"?*]+?\.[A-Za-z0-9]{1,15}(?::\d+(?::\d+)?|#L\d+(?:C\d+)?)?))\)|https?:\/\/[^\s<]+|(?:file:\/\/\/)?[A-Za-z]:[\\/][^\r\n<>|"?*]+?\.[A-Za-z0-9]{1,15}(?::\d+(?::\d+)?|#L\d+(?:C\d+)?)?(?=$|[\s`)\]}，。；、]))/gi
  return text.split(token).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${keyPrefix}-${index}`}>{renderInline(part.slice(2, -2), `${keyPrefix}-${index}`, onPreview)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) {
      const reference = parseFileReference(part.slice(1, -1))
      return reference ? <FileLink reference={reference} onPreview={onPreview} key={`${keyPrefix}-${index}`} /> : <code key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</code>
    }
    const link = part.match(/^\[([^\]]+)\]\((.+)\)$/)
    const reference = parseFileReference(link?.[2] || part, link?.[1])
    if (reference) return <FileLink reference={reference} onPreview={onPreview} key={`${keyPrefix}-${index}`} />
    if (link && /^https?:\/\//i.test(link[2])) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'web', value: link[2], title: link[1] })} key={`${keyPrefix}-${index}`}>{link[1]}</button>
      : <a href={link[2]} target="_blank" rel="noreferrer" key={`${keyPrefix}-${index}`}>{link[1]}</a>
    if (/^https?:\/\//i.test(part)) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'web', value: part, title: new URL(part).hostname })} key={`${keyPrefix}-${index}`}>{part}</button>
      : <a href={part} target="_blank" rel="noreferrer" key={`${keyPrefix}-${index}`}>{part}</a>
    return <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>
  })
}
