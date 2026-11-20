import { ApiStatus, CatalogType, HttpMethod, ParamType } from '@/enums'

/** 根目录 ID。 */
export const ROOT_CATALOG = '_'

/**
 * 静态配置模块。
 *
 * 本文件只承载**不随语言变化**的数据（颜色、数值、协议常量）与**文案 key**。
 *
 * 纪律（违反会导致切换语言后文案不刷新）：
 * - 文案字段一律以 `*Key` 命名，值是 i18n key 字面量，由消费方在**渲染期**用 `t()` 求值。
 * - 绝不在本文件存 `t()` 的求值结果，也绝不在模块顶层 `map` 出带文案的数组——
 *   那样模块加载时求值一次，此后切语言永远不刷新。
 *
 * 需要区分两类「中文」：
 * - `HTTP_METHOD_CONFIG.text` 是 HTTP 协议方法缩写（GET / POST / DEL …），**不翻译**。
 * - `HTTP_CODE_CONFIG` / `API_STATUS_CONFIG` / `API_MENU_CONFIG` 的文本是纯界面文案，**必须翻译**。
 */

/** 有关 HTTP 方法的用于展示配置。`text` 为协议缩写，不参与 i18n。 */
export const HTTP_METHOD_CONFIG = {
  [HttpMethod.Get]: {
    text: HttpMethod.Get,
    color: '--color-green-6',
  },
  [HttpMethod.Post]: {
    text: HttpMethod.Post,
    color: '--color-orange-6',
  },
  [HttpMethod.Put]: {
    text: HttpMethod.Put,
    color: '--color-blue-6',
  },
  [HttpMethod.Delete]: {
    text: 'DEL',
    color: '--color-volcano-6',
  },
  [HttpMethod.Options]: {
    text: 'OPT',
    color: '--color-blue-6',
  },
  [HttpMethod.Head]: {
    text: HttpMethod.Head,
    color: '--color-blue-6',
  },
  [HttpMethod.Patch]: {
    text: 'PAT',
    color: '--color-pink-6',
  },
  [HttpMethod.Trace]: {
    text: 'TRA',
    color: '--color-geekblue-6',
  },
} as const satisfies Record<
  HttpMethod,
  {
    text: string
    color: string
  }
>

/** HTTP 状态码配置。`textKey` / `descKey` 为 i18n key，取值见 `menu.httpCode.<code>`。 */
export const HTTP_CODE_CONFIG = {
  [200]: {
    value: 200,
    textKey: 'menu.httpCode.200.text',
    descKey: 'menu.httpCode.200.desc',
  },
  [201]: {
    value: 201,
    textKey: 'menu.httpCode.201.text',
    descKey: 'menu.httpCode.201.desc',
  },
  [202]: {
    value: 202,
    textKey: 'menu.httpCode.202.text',
    descKey: 'menu.httpCode.202.desc',
  },
  [204]: {
    value: 204,
    textKey: 'menu.httpCode.204.text',
    descKey: 'menu.httpCode.204.desc',
  },
  [400]: {
    value: 400,
    textKey: 'menu.httpCode.400.text',
    descKey: 'menu.httpCode.400.desc',
  },
  [401]: {
    value: 401,
    textKey: 'menu.httpCode.401.text',
    descKey: 'menu.httpCode.401.desc',
  },
  [403]: {
    value: 403,
    textKey: 'menu.httpCode.403.text',
    descKey: 'menu.httpCode.403.desc',
  },
  [404]: {
    value: 404,
    textKey: 'menu.httpCode.404.text',
    descKey: 'menu.httpCode.404.desc',
  },
  [410]: {
    value: 410,
    textKey: 'menu.httpCode.410.text',
    descKey: 'menu.httpCode.410.desc',
  },
  [422]: {
    value: 422,
    textKey: 'menu.httpCode.422.text',
    descKey: 'menu.httpCode.422.desc',
  },
  [500]: {
    value: 500,
    textKey: 'menu.httpCode.500.text',
    descKey: 'menu.httpCode.500.desc',
  },
  [502]: {
    value: 502,
    textKey: 'menu.httpCode.502.text',
    descKey: 'menu.httpCode.502.desc',
  },
  [503]: {
    value: 503,
    textKey: 'menu.httpCode.503.text',
    descKey: 'menu.httpCode.503.desc',
  },
  [504]: {
    value: 504,
    textKey: 'menu.httpCode.504.text',
    descKey: 'menu.httpCode.504.desc',
  },
} as const satisfies Record<number, { value: number, textKey: string, descKey: string }>

/** 接口状态配置。`color` 不随语言变，`textKey` 为 i18n key（见 `menu.apiStatus`）。 */
export const API_STATUS_CONFIG = {
  [ApiStatus.Designing]: {
    textKey: 'menu.apiStatus.designing',
    color: '--color-lime-6',
  },
  [ApiStatus.Pending]: {
    textKey: 'menu.apiStatus.pending',
    color: '--color-yellow-6',
  },
  [ApiStatus.Developing]: {
    textKey: 'menu.apiStatus.developing',
    color: '--color-blue-6',
  },
  [ApiStatus.Obsolete]: {
    textKey: 'menu.apiStatus.obsolete',
    color: '--color-grey-6',
  },
  [ApiStatus.Integrating]: {
    textKey: 'menu.apiStatus.integrating',
    color: '--color-pink-6',
  },
  [ApiStatus.Testing]: {
    textKey: 'menu.apiStatus.testing',
    color: '--color-orange-6',
  },
  [ApiStatus.Tested]: {
    textKey: 'menu.apiStatus.tested',
    color: '--color-purple-6',
  },
  [ApiStatus.Released]: {
    textKey: 'menu.apiStatus.released',
    color: '--color-green-6',
  },
  [ApiStatus.Deprecated]: {
    textKey: 'menu.apiStatus.deprecated',
    color: '--color-grey-6',
  },
  [ApiStatus.Exception]: {
    textKey: 'menu.apiStatus.exception',
    color: '--color-red-6',
  },
} as const satisfies Record<
  ApiStatus,
  {
    textKey: string
    color: string
  }
>

export const PARAMS_CONFIG = {
  [ParamType.String]: {
    varColor: '--color-green-6',
  },
  [ParamType.Integer]: {
    varColor: '--color-pink-6',
  },
  [ParamType.Boolean]: {
    varColor: '--color-pink-6',
  },
  [ParamType.Number]: {
    varColor: '--color-pink-6',
  },
  [ParamType.Array]: {
    varColor: '--color-green-6',
  },
  [ParamType.File]: {
    varColor: '--color-blue-6',
  },
} as const satisfies Record<ParamType, { varColor: string }>

/**
 * 顶级目录配置。
 *
 * 文案字段全部改为 i18n key（`menu.catalog` / `menu.catalogNew` / `menu.catalogTip`），
 * `accentColor` 保留为数据。`Overview` 与 `Recycle` 没有新建含义，对应 key 为空字符串，
 * 消费方需判空后再取词。
 */
export const API_MENU_CONFIG = {
  [CatalogType.Overview]: {
    titleKey: 'menu.catalog.overview',
    newLabelKey: '',
    tipTitleKey: '',
    accentColor: '',
  },
  [CatalogType.Recycle]: {
    titleKey: 'menu.catalog.recycle',
    newLabelKey: '',
    tipTitleKey: '',
    accentColor: '',
  },
  [CatalogType.Http]: {
    titleKey: 'menu.catalog.http',
    newLabelKey: 'menu.catalogNew.http',
    tipTitleKey: 'menu.catalogTip.http',
    accentColor: '#eb2f96',
  },
  [CatalogType.Schema]: {
    titleKey: 'menu.catalog.schema',
    newLabelKey: 'menu.catalogNew.schema',
    tipTitleKey: 'menu.catalogTip.schema',
    accentColor: '#9373ee',
  },
  [CatalogType.Request]: {
    titleKey: 'menu.catalog.request',
    newLabelKey: 'menu.catalogNew.request',
    tipTitleKey: 'menu.catalogTip.request',
    accentColor: 'rgb(95 128 233)',
  },
  [CatalogType.Markdown]: {
    titleKey: 'menu.catalog.markdown',
    newLabelKey: 'menu.catalogNew.markdown',
    tipTitleKey: 'menu.catalogTip.markdown',
    accentColor: '#13c2c2',
  },
} as const satisfies Record<
  CatalogType,
  { titleKey: string, tipTitleKey: string, newLabelKey: string, accentColor: string }
>
