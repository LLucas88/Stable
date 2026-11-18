export type EditPoint = { x: number; y: number }
export type EditStroke = { points: EditPoint[]; width: number; color: string }
export type EditComment = EditPoint & { text: string }
export type EditResize = { mode: 'scale' | 'crop' | 'pad'; width: number; height: number; x: number; y: number; background: 'transparent' | 'white' }
export type ImageEditDraft = {
  requestId: string; prompt: string; strokes: EditStroke[]; comments: EditComment[]
  background?: 'auto' | 'opaque' | 'transparent'; complexity?: 'low' | 'medium' | 'high'
  outputFormat?: 'png' | 'jpeg' | 'webp'; connectionId?: string; upstreamModel?: string; editTransport?: 'json' | 'multipart'; keepOutside?: boolean
  region?: {x:number;y:number;width:number;height:number}
  removeBackground: boolean; resize?: EditResize; model: string; quality: string
}
export type ImageEditVersion = { id: string; path: string; width: number; height: number; label: string; parentId?: string; accepted?: boolean }
export type ImageEditView = {
  id: string; conversationId: string; versionId: string; versions: ImageEditVersion[]
  connections?: {id:string;displayName:string}[]
  previewUrl: string; draft: ImageEditDraft
}
export interface ImageEditorApi {
  open(conversationId: string, path: string): Promise<ImageEditView>
  select(id: string, versionId: string): Promise<ImageEditView>
  save(id: string, versionId: string, draft: ImageEditDraft): Promise<void>
  submit(id: string, versionId: string, draft: ImageEditDraft, guide?: string): Promise<ImageEditView>
  cancel(id: string): Promise<void>
  accept(id: string, versionId: string): Promise<void>
}
