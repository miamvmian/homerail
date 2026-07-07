/**
 * ============================================================================
 * Tool Renderer System - 工具渲染器体系
 * ============================================================================
 *
 * 提供不同工具类型的定制化渲染策略
 * 使用策略模式实现工具渲染器的注册和分发
 *
 * 核心设计：
 * - ToolRenderer: 工具渲染器接口
 * - ToolRendererFactory: 渲染器工厂，管理所有渲染器
 * - 内置常用工具的渲染器实现
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 工具渲染结果
 */
export interface RenderedToolContent {
  /** 原始工具名称（如 "Read"） */
  rawName: string
  /** 显示名称（如 "Read file.txt"） */
  displayName: string
  /** 输入部分预览 */
  inputPreview: string
  /** 输入完整内容 */
  inputFull: string
  /** 结果预览 */
  resultPreview: string
  /** 结果完整内容 */
  resultFull: string
  /** 是否可展开 */
  expandable: boolean
  /** 成功/失败状态 */
  status: 'success' | 'error' | 'pending'
}

/**
 * 工具渲染器接口
 */
export interface ToolRenderer {
  /** 检查是否支持该工具 */
  canRender(toolName: string): boolean

  /** 获取工具显示名称 */
  getDisplayName(toolName: string, input: Record<string, unknown>): string

  /** 渲染输入部分 */
  renderInput(input: Record<string, unknown>): {
    preview: string
    full: string
  }

  /** 渲染结果部分 */
  renderResult(result: string | Record<string, unknown>, isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  }

  /** 优先级（数字越大优先级越高） */
  priority: number
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 截断文本
 */
function truncate(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * 格式化 JSON
 */
function formatJSON(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}

/**
 * 格式化工具名称（添加 MCP 前缀处理）
 */
function formatRawToolName(toolName: string): string {
  // 处理 MCP 工具名称
  if (toolName.startsWith('mcp__manager__')) {
    return toolName.replace('mcp__manager__', '')
  }
  return toolName
}

/**
 * 提取文件名
 */
function extractFileName(input: Record<string, unknown>): string {
  const path = String(input.file_path || input.path || '')
  if (!path) return ''
  return path.split('/').pop() || path
}

/**
 * 简化命令显示（提取关键参数）
 */
function simplifyCommand(cmd: string): string {
  // 保留基本命令结构，省略冗长的参数
  const parts = cmd.split(/\s+/)
  if (parts.length === 0) return cmd

  // 保留第一个命令和关键参数
  const result = [parts[0]]
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    // 跳过太长的参数值
    if (part.startsWith('--')) {
      result.push(part)
    } else if (part.length < 50) {
      result.push(part)
    } else if (i === parts.length - 1) {
      result.push('...')
    }
  }
  return result.join(' ')
}

// ============================================================================
// Bash Tool Renderer - Bash 工具专用渲染器
// ============================================================================

class BashToolRenderer implements ToolRenderer {
  priority = 100

  canRender(toolName: string): boolean {
    return toolName.toLowerCase() === 'bash'
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const cmd = String(input.command || '')
    const baseCmd = cmd.split(/\s+/)[0] || ''
    return baseCmd ? `${rawName} ${baseCmd}` : rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const cmd = String(input.command || '')
    const timeout = input.timeout ? ` (timeout: ${input.timeout}s)` : ''

    // 预览：简化命令
    const preview = `${simplifyCommand(cmd)}${timeout}`
    // 完整：显示原始命令
    const full = `Command: ${cmd}${timeout}${input.workdir ? `\nWorkdir: ${input.workdir}` : ''}`

    return { preview, full }
  }

  renderResult(result: string | Record<string, unknown>, isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)
    const resultLines = resultStr.split('\n')

    // 预览：根据成功/失败显示不同内容
    let preview: string
    if (isError) {
      // 失败：显示错误信息摘要
      preview = resultLines.slice(0, 3).join('\n') || 'Command failed'
    } else {
      // 成功：显示输出行数和最后一个非空行
      const nonEmptyLines = resultLines.filter(l => l.trim())
      if (nonEmptyLines.length === 0) {
        preview = '(no output)'
      } else if (nonEmptyLines.length === 1) {
        preview = nonEmptyLines[0]
      } else {
        preview = `${nonEmptyLines.length} lines, last: ${nonEmptyLines[nonEmptyLines.length - 1]}`
      }
    }

    // 完整输出
    const full = resultStr

    // 是否可展开
    const expandable = resultStr.length > 300 || resultLines.length > 10

    return { preview, full, expandable }
  }
}

// ============================================================================
// Glob Tool Renderer - 文件查找工具
// ============================================================================

class GlobToolRenderer implements ToolRenderer {
  priority = 100

  canRender(toolName: string): boolean {
    return toolName.toLowerCase() === 'glob'
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const pattern = String(input.pattern || '')
    if (pattern) {
      return `${rawName} ${pattern}`
    }
    return rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const pattern = String(input.pattern || '*')
    const baseDir = input.base_directory ? String(input.base_directory) : ''
    const exclude = input.exclude ? String(input.exclude) : ''

    const preview = `${baseDir}${pattern}`
    const full = `Pattern: ${pattern}\nBase: ${baseDir || '.'}\nExclude: ${exclude || '(none)'}`

    return { preview, full }
  }

  renderResult(result: string | Record<string, unknown>, isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)
    const files = resultStr.split('\n').filter(f => f.trim())

    if (isError) {
      return {
        preview: 'Error: ' + (files[0] || 'Glob failed'),
        full: resultStr,
        expandable: false
      }
    }

    const count = files.length
    const preview = count === 0 ? '(no matches)' : `${count} file${count > 1 ? 's' : ''}`
    const full = resultStr

    return {
      preview,
      full,
      expandable: count > 5
    }
  }
}

// ============================================================================
// Grep Tool Renderer - 文本搜索工具
// ============================================================================

class GrepToolRenderer implements ToolRenderer {
  priority = 100

  canRender(toolName: string): boolean {
    return toolName.toLowerCase() === 'grep'
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const pattern = String(input.pattern || '')
    if (pattern) {
      return `${rawName} ${pattern}`
    }
    return rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const pattern = String(input.pattern || '')
    const path = input.path ? String(input.path) : '.'
    const caseSensitive = input.case_sensitive ? 'case-sensitive' : 'case-insensitive'

    const preview = `${pattern} @ ${path}`
    const full = `Pattern: ${pattern}\nPath: ${path}\nMode: ${caseSensitive}`

    return { preview, full }
  }

  renderResult(result: string | Record<string, unknown>, isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)
    const matches = resultStr.split('\n').filter(m => m.trim())

    if (isError) {
      return {
        preview: 'Error: ' + (matches[0] || 'Grep failed'),
        full: resultStr,
        expandable: false
      }
    }

    const count = matches.length
    const preview = count === 0 ? '0 matches' : `${count} match${count > 1 ? 'es' : ''}`
    const full = resultStr

    return {
      preview,
      full,
      expandable: count > 3
    }
  }
}

// ============================================================================
// Read File Tool Renderer - 读取文件工具
// ============================================================================

class ReadFileToolRenderer implements ToolRenderer {
  priority = 100

  canRender(toolName: string): boolean {
    return toolName.toLowerCase() === 'read'
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const fileName = extractFileName(input)
    if (fileName) {
      return `${rawName} ${fileName}`
    }
    return rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const path = String(input.file_path || '')
    const offset = input.offset ? Number(input.offset) : 1
    const limit = input.limit ? Number(input.limit) : null

    // 预览也显示行数信息
    const lineInfo = limit ? `${offset}-${offset + limit - 1}` : `${offset}+`
    const preview = `${path} (line ${lineInfo})`
    const full = `Path: ${path}\nLine: ${offset}${limit ? `-${offset + limit - 1}` : ''}`

    return { preview, full }
  }

  renderResult(result: string | Record<string, unknown>, isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)

    if (isError) {
      return {
        preview: 'Cannot read file',
        full: resultStr,
        expandable: false
      }
    }

    // 预览：显示前几行
    const lines = resultStr.split('\n')
    const preview = lines.length === 0
      ? '(empty file)'
      : `${lines.length} lines`

    return {
      preview,
      full: resultStr,
      expandable: lines.length > 20 || resultStr.length > 500
    }
  }
}

// ============================================================================
// Write File Tool Renderer - 写入文件工具
// ============================================================================

class WriteFileToolRenderer implements ToolRenderer {
  priority = 100

  canRender(toolName: string): boolean {
    return toolName.toLowerCase() === 'write' || toolName.toLowerCase() === 'write_file'
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const fileName = extractFileName(input)
    if (fileName) {
      return `${rawName} ${fileName}`
    }
    return rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const path = String(input.file_path || '')
    // 支持 text 或 content 字段
    const text = input.text || input.content || ''
    const textStr = typeof text === 'string' ? text : formatJSON(text)

    // 预览：显示路径和内容摘要
    const preview = `${path} (${textStr.length} chars)`
    // 完整：显示完整内容
    const full = `Path: ${path}\n\n${textStr}`

    return { preview, full }
  }

  renderResult(result: string | Record<string, unknown>, isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)

    if (isError) {
      return {
        preview: 'Write failed',
        full: resultStr,
        expandable: false
      }
    }

    // 成功：显示写入的内容大小
    const match = resultStr.match(/(\d+) bytes?/)
    const preview = match ? `${match[1]} bytes written` : 'File written'

    return {
      preview,
      full: resultStr,
      expandable: false
    }
  }
}

// ============================================================================
// Edit / Apply Patch Tool Renderer - 编辑文件工具
// ============================================================================

class EditFileToolRenderer implements ToolRenderer {
  priority = 100

  canRender(toolName: string): boolean {
    return ['edit', 'apply_patch', 'applyPatch'].includes(toolName.toLowerCase())
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const fileName = extractFileName(input)
    if (fileName) {
      return `${rawName} ${fileName}`
    }
    return rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const path = String(input.path || input.file_path || '')

    // 显示编辑类型
    let editType = 'modify'
    if (input.substring_to_replace || input.substringToReplace) {
      editType = 'replace'
    } if (input.append_text || input.appendText) {
      editType = 'append'
    }

    const preview = `${path} [${editType}]`
    const full = `Path: ${path}\nType: ${editType}`

    return { preview, full }
  }

  renderResult(result: string | Record<string, unknown>, isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)

    if (isError) {
      return {
        preview: 'Edit failed',
        full: resultStr,
        expandable: false
      }
    }

    return {
      preview: 'File updated',
      full: resultStr,
      expandable: false
    }
  }
}

// ============================================================================
// Web Search Tool Renderer - 网络搜索工具
// ============================================================================

class WebSearchToolRenderer implements ToolRenderer {
  priority = 100

  canRender(toolName: string): boolean {
    return ['web_search', 'websearch', 'search'].includes(toolName.toLowerCase())
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const query = String(input.query || input.search_term || '')
    if (query) {
      const shortQuery = query.slice(0, 20)
      return `${rawName} ${shortQuery}${query.length > 20 ? '...' : ''}`
    }
    return rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const query = String(input.query || input.search_term || '')
    const num = input.num_results || input.max_results || 5

    const preview = query.slice(0, 50)
    const full = `Query: ${query}\nMax Results: ${num}`

    return { preview, full }
  }

  renderResult(result: string | Record<string, unknown>, isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)

    if (isError) {
      return {
        preview: 'Search failed',
        full: resultStr,
        expandable: false
      }
    }

    // 统计结果数量
    const links = resultStr.match(/\[?\d+\]?\.?\s*https?:\/\//g)
    const count = links ? links.length : 1
    const preview = `${count} result${count > 1 ? 's' : ''}`

    return {
      preview,
      full: resultStr,
      expandable: true
    }
  }
}

// ============================================================================
// Lint Tool Renderer - 代码检查工具
// ============================================================================

class LintToolRenderer implements ToolRenderer {
  priority = 100

  canRender(toolName: string): boolean {
    return ['lint', 'eslint', 'flake8', 'ruff'].includes(toolName.toLowerCase())
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const fileName = extractFileName(input)
    if (fileName) {
      return `${rawName} ${fileName}`
    }
    return rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const path = String(input.path || input.file_path || '')
    const fix = input.fix ? 'fix=true' : ''
    const strict = input.strict ? 'strict=true' : ''

    const preview = path
    const full = `Path: ${path}\nOptions: ${[fix, strict].filter(Boolean).join(', ') || '(default)'}`

    return { preview, full }
  }

  renderResult(result: string | Record<string, unknown>, isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)

    // 解析 lint 结果
    const errorCount = (resultStr.match(/error[s]?/gi) || []).length
    const warningCount = (resultStr.match(/warning[s]?/gi) || []).length

    if (isError) {
      return {
        preview: 'Lint failed',
        full: resultStr,
        expandable: true
      }
    }

    let preview: string
    if (errorCount > 0) {
      preview = `${errorCount} error${errorCount > 1 ? 's' : ''}`
    } else if (warningCount > 0) {
      preview = `${warningCount} warning${warningCount > 1 ? 's' : ''}`
    } else {
      preview = 'No issues'
    }

    return {
      preview,
      full: resultStr,
      expandable: errorCount > 0 || warningCount > 0
    }
  }
}

// ============================================================================
// TodoWrite Tool Renderer - 任务列表工具专用渲染器
// ============================================================================

class TodoWriteToolRenderer implements ToolRenderer {
  priority = 80

  canRender(toolName: string): boolean {
    return toolName.toLowerCase() === 'todowrite'
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const todos = input.todos as Array<{ content?: string; status?: string }> | undefined
    if (!todos || !Array.isArray(todos)) {
      return rawName
    }
    const completed = todos.filter(t => t.status === 'completed').length
    const total = todos.length
    return `${rawName} (${completed}/${total})`
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const todos = input.todos as Array<{ content?: string; status?: string; activeForm?: string }> | undefined

    if (!todos || !Array.isArray(todos)) {
      return { preview: 'No todos', full: formatJSON(input) }
    }

    // 预览：显示任务摘要
    const activeTodos = todos.filter(t => t.status !== 'completed')
    const preview = activeTodos.length > 0
      ? activeTodos.slice(0, 3).map(t => `[${t.status || 'pending'}] ${t.activeForm || t.content || ''}`).join('\n')
      : 'All tasks completed'

    return { preview, full: formatJSON(input) }
  }

  renderResult(result: string | Record<string, unknown>, _isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)
    const preview = resultStr.length > 200 ? resultStr.slice(0, 200) + '...' : resultStr

    return {
      preview,
      full: resultStr,
      expandable: resultStr.length > 300
    }
  }
}

// ============================================================================
// Task Tool Renderer - 任务工具专用渲染器
// ============================================================================

class TaskToolRenderer implements ToolRenderer {
  priority = 80

  canRender(toolName: string): boolean {
    return toolName.toLowerCase() === 'task'
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    const rawName = formatRawToolName(toolName)
    const prompt = String(input.prompt || '')
    if (prompt) {
      const firstLine = prompt.split('\n')[0]
      const summary = firstLine.slice(0, 20)
      return `${rawName}: ${summary}${firstLine.length > 20 ? '...' : ''}`
    }
    return rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const prompt = String(input.prompt || '')
    const preview = prompt.split('\n')[0].slice(0, 80)
    return { preview, full: `Task:\n${prompt}` }
  }

  renderResult(result: string | Record<string, unknown>, _isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)
    const preview = resultStr.length > 200 ? resultStr.slice(0, 200) + '...' : resultStr

    return {
      preview,
      full: resultStr,
      expandable: resultStr.length > 300
    }
  }
}

// ============================================================================
// Default Tool Renderer - 默认渲染器
// ============================================================================

class DefaultToolRenderer implements ToolRenderer {
  priority = 0

  canRender(_toolName: string): boolean {
    return true // 默认渲染器处理所有未匹配的工具
  }

  getDisplayName(toolName: string, input: Record<string, unknown>): string {
    // 始终返回工具名称
    const rawName = formatRawToolName(toolName)

    // 常见的参数键，用于提供上下文
    const contextKeys = ['file_path', 'path', 'pattern', 'query', 'command', 'worker_name', 'url']

    for (const key of contextKeys) {
      if (key in input) {
        const value = String(input[key] || '')
        if (value && value.length < 50) {
          return `${rawName} ${value}`
        }
      }
    }

    return rawName
  }

  renderInput(input: Record<string, unknown>): { preview: string; full: string } {
    const inputStr = formatJSON(input)
    const preview = truncate(inputStr, 150)
    return { preview, full: inputStr }
  }

  renderResult(result: string | Record<string, unknown>, _isError: boolean): {
    preview: string
    full: string
    expandable: boolean
  } {
    const resultStr = typeof result === 'string' ? result : formatJSON(result)
    const preview = truncate(resultStr, 300)

    return {
      preview,
      full: resultStr,
      expandable: resultStr.length > 300
    }
  }
}

// ============================================================================
// Tool Renderer Factory
// ============================================================================

/**
 * 工具渲染器工厂
 */
export class ToolRendererFactory {
  private static instance: ToolRendererFactory | null = null
  private renderers: ToolRenderer[] = []

  private constructor() {
    this.registerDefaults()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ToolRendererFactory {
    if (!ToolRendererFactory.instance) {
      ToolRendererFactory.instance = new ToolRendererFactory()
    }
    return ToolRendererFactory.instance
  }

  /**
   * 注册默认渲染器
   */
  private registerDefaults(): void {
    // 注册顺序影响优先级，先注册的低优先级渲染器会被高优先级的覆盖
    this.renderers.push(new BashToolRenderer())
    this.renderers.push(new GlobToolRenderer())
    this.renderers.push(new GrepToolRenderer())
    this.renderers.push(new ReadFileToolRenderer())
    this.renderers.push(new WriteFileToolRenderer())
    this.renderers.push(new EditFileToolRenderer())
    this.renderers.push(new WebSearchToolRenderer())
    this.renderers.push(new LintToolRenderer())
    this.renderers.push(new TodoWriteToolRenderer())
    this.renderers.push(new TaskToolRenderer())
    this.renderers.push(new DefaultToolRenderer())
  }

  /**
   * 注册自定义渲染器
   */
  register(renderer: ToolRenderer): void {
    this.renderers.unshift(renderer) // 添加到前面（高优先级）
  }

  /**
   * 获取渲染器
   */
  getRenderer(toolName: string): ToolRenderer {
    // 查找优先级最高的渲染器
    let bestRenderer: ToolRenderer = this.renderers[this.renderers.length - 1]
    let bestPriority = -1

    for (const renderer of this.renderers) {
      if (renderer.canRender(toolName) && renderer.priority > bestPriority) {
        bestRenderer = renderer
        bestPriority = renderer.priority
      }
    }

    return bestRenderer
  }

  /**
   * 渲染工具调用
   */
  renderToolCall(
    toolName: string,
    input: Record<string, unknown>,
    result: string | Record<string, unknown> | null,
    isError: boolean | null
  ): RenderedToolContent {
    const renderer = this.getRenderer(toolName)

    const rawName = formatRawToolName(toolName)
    const displayName = renderer.getDisplayName(toolName, input)
    const { preview: inputPreview, full: inputFull } = renderer.renderInput(input)

    let resultPreview = ''
    let resultFull = ''
    let expandable = false

    if (result !== null) {
      const { preview, full, expandable: exp } = renderer.renderResult(result, isError || false)
      resultPreview = preview
      resultFull = full
      expandable = exp
    } else {
      // 等待结果
      resultPreview = '...'
      resultFull = ''
      expandable = false
    }

    // 确定状态
    let status: 'success' | 'error' | 'pending' = 'pending'
    if (result !== null) {
      status = isError ? 'error' : 'success'
    }

    return {
      rawName,
      displayName,
      inputPreview,
      inputFull,
      resultPreview,
      resultFull,
      expandable,
      status
    }
  }
}

// ============================================================================
// Export
// ============================================================================

export const toolRendererFactory = ToolRendererFactory.getInstance()

/**
 * 便捷函数：渲染工具调用
 */
export function renderToolContent(
  toolName: string,
  input: Record<string, unknown>,
  result: string | Record<string, unknown> | null = null,
  isError: boolean | null = null
): RenderedToolContent {
  return toolRendererFactory.renderToolCall(toolName, input, result, isError)
}

export default {
  ToolRendererFactory,
  toolRendererFactory,
  renderToolContent
}
