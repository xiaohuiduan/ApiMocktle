/** 只允许通过系统浏览器打开的协议 */
export const ALLOWED_PROTOCOL = /^https?:\/\//i

/** 链接尾部常见标点：JSON 里 URL 后紧跟引号、逗号、括号 */
const TRAILING_PUNCTUATION = /[),.;:'"\]}]+$/

/** 链接头部可能包裹的引号或括号（JSON 字符串场景） */
const LEADING_PUNCTUATION = /^[("'[{]+/

/**
 * 把链接文本规整为可打开的外部地址；非 http/https 一律返回 null。
 *
 * 独立成纯函数，便于单测覆盖协议白名单（避免 file:// 打开本地文件、
 * javascript: 执行脚本）。Monaco 链接打开器与 Markdown 预览共用。
 */
export function resolveExternalUrl(raw: string): string | null {
  const url = raw
    .trim()
    .replace(LEADING_PUNCTUATION, '')
    .replace(TRAILING_PUNCTUATION, '')

  return ALLOWED_PROTOCOL.test(url) ? url : null
}
