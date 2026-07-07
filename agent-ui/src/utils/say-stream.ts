export interface SaySegment {
  text: string
  final: boolean
}

const OPEN_TAG = '<say>'
const CLOSE_TAG = '</say>'
const SENTENCE_END = /[。！？!?]\s*$/
const SOFT_END = /[，,；;：:]\s*$/

export class SayStreamExtractor {
  private buffer = ''
  private sayBuffer = ''
  private inside = false

  push(delta: string): SaySegment[] {
    const segments: SaySegment[] = []
    this.buffer += delta

    while (this.buffer) {
      if (!this.inside) {
        const open = this.buffer.indexOf(OPEN_TAG)
        if (open < 0) {
          this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - (OPEN_TAG.length - 1)))
          break
        }
        this.buffer = this.buffer.slice(open + OPEN_TAG.length)
        this.inside = true
        continue
      }

      const close = this.buffer.indexOf(CLOSE_TAG)
      if (close >= 0) {
        this.sayBuffer += this.buffer.slice(0, close)
        this.buffer = this.buffer.slice(close + CLOSE_TAG.length)
        const text = this.flushText()
        if (text) segments.push({ text, final: true })
        this.inside = false
        continue
      }

      const safeLength = Math.max(0, this.buffer.length - (CLOSE_TAG.length - 1))
      if (safeLength === 0) break
      this.sayBuffer += this.buffer.slice(0, safeLength)
      this.buffer = this.buffer.slice(safeLength)
      const text = this.extractReadyText()
      if (text) segments.push({ text, final: false })
    }

    return segments
  }

  finish(): SaySegment[] {
    const text = this.flushText()
    this.buffer = ''
    this.inside = false
    return text ? [{ text, final: true }] : []
  }

  reset(): void {
    this.buffer = ''
    this.sayBuffer = ''
    this.inside = false
  }

  private extractReadyText(): string {
    const trimmed = this.sayBuffer.trim()
    if (trimmed.length < 18) return ''
    if (!SENTENCE_END.test(trimmed) && !(trimmed.length >= 32 && SOFT_END.test(trimmed))) return ''
    return this.flushText()
  }

  private flushText(): string {
    const text = this.sayBuffer.replace(/\s+/g, ' ').trim()
    this.sayBuffer = ''
    return text
  }
}

export function stripSayTags(text: string): string {
  return text.replace(/<\/?say>/g, '')
}
