const MAX_HISTORY = 20

function storageKey(userId: string | null): string {
  return userId ? `search_history:${userId}` : 'search_history'
}

function safeParse(raw: string | null): string[] {
  if (!raw) return []
  try {
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function loadHistory(userId: string | null): string[] {
  try {
    return safeParse(localStorage.getItem(storageKey(userId)))
  } catch {
    return []
  }
}

export function addHistory(userId: string | null, word: string): string[] {
  const w = word.trim().toLowerCase()
  if (!w) return loadHistory(userId)
  const next = [w, ...loadHistory(userId).filter((s) => s !== w)].slice(0, MAX_HISTORY)
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next))
  } catch {
    // 忽略隐私模式/容量等写入失败
  }
  return next
}

export function clearHistory(userId: string | null): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // 忽略写入失败
  }
}
