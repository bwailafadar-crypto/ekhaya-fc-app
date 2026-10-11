// Small helpers shared by the Fan Zone and the match centre.

export function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0
}

export function saveErrorText(error: unknown, fallback: string) {
  const code = (error as { code?: string })?.code
  return code === 'permission-denied' ? 'Please verify your email first (check your inbox), then try again.' : fallback
}
