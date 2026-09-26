export function jumpConversationToLatestOnMobile(
  isMobile: boolean,
  isHomeRoute: boolean,
  jumpToLatest: () => void,
): void {
  if (!isMobile || isHomeRoute) return
  jumpToLatest()
}
