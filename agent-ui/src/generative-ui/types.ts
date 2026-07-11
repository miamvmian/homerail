import type {
  GenerativeUiActionV1,
  GenerativeUiCompositionItemV1,
  GenerativeUiCompositionV1,
  GenerativeUiDocumentV1,
  GenerativeUiSurfaceContextV1,
  GenerativeUiTransactionV1,
  GenerativeUiUserOverrideV1,
  HomerailPluginUiProjectionV1,
} from 'homerail-protocol'

export interface GenerativeUiProjectionV1 {
  stream_version: 1
  mode: 'shadow'
  authoritative: false
  purpose: 'legacy_widget_shadow'
  document: GenerativeUiDocumentV1
  cursor: number
  overrides: GenerativeUiUserOverrideV1[]
  composition: GenerativeUiCompositionV1
  ui_registry: HomerailPluginUiProjectionV1
}

export interface GenerativeUiSnapshotStreamEventV1 {
  type: 'generative_ui'
  event: 'snapshot'
  stream_version: 1
  authoritative: false
  purpose: 'legacy_widget_shadow'
  document: GenerativeUiDocumentV1
  cursor: number
  overrides: GenerativeUiUserOverrideV1[]
  composition: GenerativeUiCompositionV1
  ui_registry: HomerailPluginUiProjectionV1
}

export interface GenerativeUiTransactionStreamEventV1 {
  type: 'generative_ui'
  event: 'transaction'
  stream_version: 1
  authoritative: false
  purpose: 'legacy_widget_shadow'
  seq: number
  document_id: string
  transaction_id: string
  committed_revision: number
  committed_at: string
  revision: number
  transaction: GenerativeUiTransactionV1
}

export type GenerativeUiStreamEventV1 =
  | GenerativeUiSnapshotStreamEventV1
  | GenerativeUiTransactionStreamEventV1

export interface GenerativeUiRendererPropsV1 {
  node: GenerativeUiDocumentV1['nodes'][number]
  placement: GenerativeUiCompositionItemV1
  context: GenerativeUiSurfaceContextV1
}

export interface GenerativeUiActionRequestV1 {
  document_id: string
  node_id: string
  node_revision: number
  action: GenerativeUiActionV1
}

export interface GenerativeUiPreviewRequestV1 {
  title?: string
  url: string
  kind?: 'html' | 'image' | 'gallery'
  layout?: 'fluid' | 'portrait'
  images?: string[]
}
