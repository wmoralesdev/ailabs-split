/** Nearest overflow scroller, preferring the room app-shell marker. */
export function findScrollParent(start: Element | null): HTMLElement | null {
  const shell = start?.closest("[data-app-shell]")
  const marked = shell?.querySelector("[data-app-scroll]")
  if (marked instanceof HTMLElement) return marked

  let node = start instanceof HTMLElement ? start.parentElement : null
  while (node && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node)
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return node
    }
    node = node.parentElement
  }
  return null
}

export function readScrollTop(scroller: HTMLElement | null): number {
  if (scroller) return scroller.scrollTop
  return window.scrollY || document.documentElement.scrollTop || 0
}

export function subscribeScroll(
  scroller: HTMLElement | null,
  listener: () => void
): () => void {
  const target: HTMLElement | Window = scroller ?? window
  target.addEventListener("scroll", listener, { passive: true })
  return () => target.removeEventListener("scroll", listener)
}
