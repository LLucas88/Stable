

export type ConversationPreviewTarget =
  | { requestId: number; kind: 'web'; value: string; title: string }
  | { requestId: number; kind: 'file'; value: string; title: string }
