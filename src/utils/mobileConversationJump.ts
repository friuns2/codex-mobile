export function jumpConversationToLatestOnMobile(
  isMobile: boolean,
  isHomeRoute: boolean,
  jumpToLatest: () => boolean,
): boolean {
  if (!isMobile || isHomeRoute) return false
  return jumpToLatest()
}
