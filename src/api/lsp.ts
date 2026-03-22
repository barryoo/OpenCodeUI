// ============================================
// LSP API - Language Server Protocol 状态
// ============================================

import { get } from './http'
import { formatPathForApi } from '../utils/directoryUtils'

export interface LSPStatus {
  id: string
  name: string
  root: string
  status: 'connected' | 'error'
}

/**
 * 获取 LSP 服务状态
 */
export async function getLspStatus(directory?: string): Promise<LSPStatus[]> {
  return get<LSPStatus[]>('/lsp', { directory: formatPathForApi(directory) })
}

export interface FormatterStatus {
  available: boolean
  name?: string
}

/**
 * 获取格式化器状态
 */
export async function getFormatterStatus(directory?: string): Promise<FormatterStatus> {
  return get<FormatterStatus>('/formatter', { directory: formatPathForApi(directory) })
}
