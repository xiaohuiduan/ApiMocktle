/**
 * 局域网只读分享页相关文案。
 *
 * 分享页是访客用浏览器打开的独立入口：无 Tauri IPC、无语言切换 UI，
 * 语言由访客浏览器决定（`initI18n({ mode: 'system' })`）。
 */
export const share = {
  page: {
    title: '接口文档分享',
  },
  /** 密码鉴权页 */
  auth: {
    passwordProtected: '该分享已设置密码保护',
    passwordPlaceholder: '请输入访问密码',
    passwordRequired: '请输入密码',
    enter: '进入文档',
  },
  /** 顶栏统计 */
  header: {
    apiCount: '接口 {{total}}',
    docCount: '文档 {{total}}',
    schemaCount: '模型 {{total}}',
  },
  /** 左侧目录树 */
  tree: {
    emptyHint: '从左侧选择接口或文档查看',
  },
  /** 字段表格列名（接口详情与数据模型共用） */
  table: {
    field: '字段',
    type: '类型',
    required: '必填',
    optional: '可选',
    description: '说明',
  },
  /** 接口详情 */
  apiDetail: {
    unnamed: '未命名接口',
    serverUrl: '前置 URL',
    requestParams: '请求参数',
    pathParams: '路径参数',
    queryParams: 'Query 参数',
    headerParams: 'Header 参数',
    cookieParams: 'Cookie 参数',
    paramName: '参数名',
    requestBody: '请求体',
    requestBodySchema: '请求体结构',
    responses: '响应',
    responseSchema: '响应结构',
  },
  /** 数据模型 */
  schema: {
    example: '示例',
  },
  /** 错误提示 */
  error: {
    missingShareId: '链接缺少分享 ID',
    network: '网络异常，请确认分享服务已启动',
    autoLoginFailed: '自动登录失败，请手动输入密码',
    loadFailed: '加载失败',
    requestFailed: '请求失败({{status}})',
  },
}
