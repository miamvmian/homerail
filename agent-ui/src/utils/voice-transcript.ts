const ASR_DUPLICATE_MIN_NORMALIZED_LENGTH = 8
const DUPLICATE_RECENT_WINDOW_MS = 3000
const DUPLICATE_NORMALIZE_RE = /[\s，,。.!！?？；;：:、"'“”‘’（）()[\]{}<>《》]+/g
const DUPLICATE_SPLIT_HINT_RE = /[\s，,。.!！?？；;：:、]/

export function normalizeVoiceTranscriptForDuplicate(text: string): string {
  return text.replace(DUPLICATE_NORMALIZE_RE, '').toLowerCase().trim()
}

export function cleanVoiceTranscript(text: string): string {
  const cleaned = text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/(?:^|\s)language\s*[a-zA-Z-]*s?\s*<\s*asr_text\s*>/gi, ' ')
    .replace(/<\s*\/?\s*asr_text\s*>/gi, ' ')
    .replace(/^\s*language\s+[a-zA-Z-]+\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return collapseRepeatedVoiceTranscript(cleaned)
}

export function isRecentDuplicateVoiceTranscript(
  text: string,
  previousKey: string,
  previousAt: number,
  now = Date.now(),
  windowMs = DUPLICATE_RECENT_WINDOW_MS,
): boolean {
  const key = normalizeVoiceTranscriptForDuplicate(text)
  return Boolean(key && previousKey === key && now - previousAt < windowMs)
}

export function collapseRepeatedVoiceTranscript(text: string): string {
  let current = text.trim()
  for (let pass = 0; pass < 3; pass += 1) {
    const next = collapseRepeatedVoiceTranscriptOnce(current)
    if (next === current) break
    current = next
  }
  return current
}

function collapseRepeatedVoiceTranscriptOnce(text: string): string {
  const clean = text.trim()
  let best = ''
  let bestDistance = Number.POSITIVE_INFINITY
  const midpoint = clean.length / 2

  for (let index = 1; index < clean.length; index += 1) {
    if (!isLikelyDuplicateSplit(clean, index)) continue
    const left = clean.slice(0, index).trim()
    const right = clean.slice(index).trim()
    if (!left || !right) continue
    const leftKey = normalizeVoiceTranscriptForDuplicate(left)
    if (leftKey.length < ASR_DUPLICATE_MIN_NORMALIZED_LENGTH) continue
    if (leftKey !== normalizeVoiceTranscriptForDuplicate(right)) continue
    const distance = Math.abs(index - midpoint)
    if (distance < bestDistance) {
      best = left
      bestDistance = distance
    }
  }

  return best || clean
}

function isLikelyDuplicateSplit(text: string, index: number): boolean {
  return DUPLICATE_SPLIT_HINT_RE.test(text[index - 1] || '') || DUPLICATE_SPLIT_HINT_RE.test(text[index] || '')
}
