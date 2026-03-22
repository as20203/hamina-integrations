import type { MouseEvent } from "react";

/**
 * For clickable rows/cards that also expose selectable text (IDs, MACs, addresses):
 * return true when the user has an active text selection inside `e.currentTarget`,
 * so the handler can avoid navigating (e.g. they are copying text).
 */
export const shouldSkipNavigationForTextSelection = <T extends HTMLElement>(e: MouseEvent<T>): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    return false;
  }
  const el = e.currentTarget;
  const range = sel.getRangeAt(0);
  return el.contains(range.commonAncestorContainer);
};
