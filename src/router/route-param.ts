export function requireRouteParam(value: string | undefined, paramName: string) {
  if (!value) {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- Next.js loader 约定抛 Response
    throw new Response(`${paramName} 缺失`, { status: 404 })
  }

  return value
}
