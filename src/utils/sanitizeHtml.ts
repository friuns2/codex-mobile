/**
 * Lightweight HTML sanitizer using native browser DOMParser.
 * Removes dangerous elements (script, iframe, object, embed, style) and
 * event-handler attributes (onclick, onerror, etc.) from HTML strings.
 */

const ALLOWED_TAGS = new Set([
  'a', 'b', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span',
  'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'tr', 'ul', 'dl', 'dt', 'dd', 'blockquote', 'details', 'summary',
])

const DENIED_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'object', 'embed', 'param',
  'applet', 'link', 'base', 'meta', 'noscript',
])

/**
 * Sanitize an HTML string in the browser.
 * Parses the HTML, strips forbidden tags and attributes, and returns clean HTML.
 */
export function sanitizeHtml(raw: string): string {
  if (typeof DOMParser === 'undefined') return raw
  if (!raw) return ''

  const doc = new DOMParser().parseFromString(raw, 'text/html')

  // Walk all elements and remove dangerous ones
  const allElements = doc.body.querySelectorAll('*')
  for (const el of allElements) {
    const tag = el.tagName.toLowerCase()

    if (DENIED_TAGS.has(tag)) {
      el.remove()
      continue
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Remove unknown tags but keep their text content
      const parent = el.parentNode
      if (parent) {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el)
        }
        el.remove()
      }
      continue
    }

    // Remove dangerous attributes (event handlers, javascript: URLs)
    const attrs = el.attributes
    for (let i = attrs.length - 1; i >= 0; i--) {
      const attrName = attrs[i].name.toLowerCase()
      const attrValue = attrs[i].value.toLowerCase()

      if (attrName.startsWith('on')) {
        el.removeAttribute(attrs[i].name)
        continue
      }

      if (attrName === 'href' || attrName === 'src' || attrName === 'action') {
        if (attrValue.startsWith('javascript:') || attrValue.startsWith('vbscript:') || attrValue.startsWith('data:')) {
          el.removeAttribute(attrs[i].name)
        }
      }
    }
  }

  return doc.body.innerHTML
}
