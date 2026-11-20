import { t } from '@/i18n'

export function requireRouteParam(value: string | undefined, paramName: string) {
  if (!value) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Next.js loader 约定抛 Response
    throw new Response(t('app.errors.missingRouteParam', { param: paramName }), { status: 404 })
  }

  return value
}
