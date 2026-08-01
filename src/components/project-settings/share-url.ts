import type { ShareLink } from './CreateShareModal'

/** 生成分享链接；withPassword=true 且设了密码时附带 ?pwd= 参数，访客打开自动填充 */
export function buildShareLinkUrl(
  baseUrl: string,
  link: Pick<ShareLink, 'id' | 'hasPassword'>,
  withPassword: boolean,
  password?: string,
): string {
  const plain = `${baseUrl}#/share/${link.id}`

  if (withPassword && link.hasPassword && password) {
    return `${plain}?pwd=${encodeURIComponent(password)}`
  }

  return plain
}
