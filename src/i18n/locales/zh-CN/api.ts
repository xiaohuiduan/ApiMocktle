/**
 * 接口菜单、接口文档、参数表、请求体与运行调试相关文案。
 *
 * 分组约定：
 * - `menu`        左侧接口目录树与其操作菜单
 * - `tab`         内容页签
 * - `overview` / `recycle` / `markdown` / `schema` / `folder`  各目录页
 * - `doc`         接口文档查看/编辑
 * - `response`    响应定义（新增响应弹窗等）
 * - `field`       接口基础信息字段
 * - `paramTable`  参数可编辑表格
 * - `params`      全局/环境参数参考条
 * - `body`        Body 面板与内容槽位
 * - `run`         运行调试、结果查看、报告导出
 * - `history`     运行历史
 * - `script`      前后置脚本
 * - `curl`        cURL 导入与解析
 */
export const api = {
  /** 保存结果提示（文档、快捷请求、运行态保存共用）。 */
  save: {
    success: '保存成功',
    failed: '保存失败',
    failedWithPermission: '保存失败，请检查权限',
  },

  response: {
    addTitle: '添加响应',
    name: '名称',
    statusCode: 'HTTP 状态码',
    contentType: '内容格式',
    defaultName: '成功',
    add: '添加',
    confirmDeletePrefix: '确定删除？确定后点击右上角',
    confirmDeleteSuffix: '按钮生效',
    deleted: '响应已删除，点击右上角保存后生效',
  },

  field: {
    status: '状态',
    tags: '标签',
    tagsPlaceholder: '查找或回车创建标签',
    description: '说明',
  },

  /** 左侧接口目录树。 */
  menu: {
    selectToDelete: '请选择要删除的菜单项（接口、目录、模型等）',
    confirmBatchDelete: '确定删除所选的 {{count}} 项？',
    batchDeleteDesc: '目录会连同子项一并删除，并进入回收站（30 天内可恢复）。',
    batchDeleteSuccess: '已移入回收站 {{count}} 个条目，30 天内可恢复，可在左侧「回收站」查看',
    batchDeleteSuccessWithChildren: '已移入回收站 {{count}} 个条目（含 {{children}} 个子项），30 天内可恢复，可在左侧「回收站」查看',
    batchDeleteFailed: '批量删除失败',
    retryLater: '请稍后重试',
    movedToRecycleBin: '已移入回收站，30 天内可恢复，可在左侧“回收站”查看',
    batchSelect: '批量选择',
    batchExit: '退出批量',
    deleteSelected: '删除所选（{{count}}）',
    empty: '还没有接口、模型或快捷请求',
    importOpenApi: '导入 OpenAPI',
    searchNoMatch: '未找到与 “{{word}}” 匹配的内容',
    clearSearch: '清除搜索',
    unsaved: '未保存',
    crossGroupRejected: '「{{drag}}」不能移入「{{drop}}」所在分组',
    newCatalog: '新建目录',
    newApiFolder: '新建接口目录',
    importCurl: '导入 cURL',
    importFromCurl: '从 cURL 导入',
    collapseAll: '全部收起',
    expandAll: '全部展开',
    displayAsName: '接口显示为名称',
    displayAsUrl: '接口显示为 URL',
    rename: '重命名',
    moveTo: '移动到',
    runAll: '运行全部',
    addSubCatalog: '添加子目录',
    deleteFolderTitle: '删除目录“{{name}}”？',
    deleteFolderWithApisPrefix: '该目录及该目录下的接口和用例都',
    deleteFolderWithSchemasPrefix: '该目录及该目录下的数据模型都',
    moveToRecycleBinSuffix: '将移至回收站，30 天后自动彻底删除。',
    deleteFileTitle: '删除{{kind}}“{{name}}”？',
    deleteApiPrefix: '该接口和该接口下的用例都',
    deleteDocPrefix: '文档',
    deleteSchemaPrefix: '该数据模型',
    discardDraft: '删除草稿',
    noRunnableApi: '该目录下没有可运行的接口',
    missingApiData: '缺少接口数据',
    runFailed: '运行失败',
    batchRunResult: '批量运行结果（{{count}}）',
    batchRunSummary: '成功 {{success}} / 失败 {{failed}}',
    columnApi: '接口',
    columnStatus: '状态',
    columnDuration: '耗时',
    columnInfo: '信息',
    errorTag: '错误',
  },

  /** 内容页签。 */
  tab: {
    newTab: '新建...',
    closeTab: '关闭页签',
    moveLeft: '左移标签',
    moveRight: '右移标签',
    closeAll: '关闭所有标签页',
    closeOthers: '关闭其他标签页',
    unsavedTitle: '有修改的内容未保存',
    directClose: '直接关闭',
    saveAndClose: '保存并关闭',
    switchFirst: '请先切换到该页签后再保存',
    unsavedContentIntro: '修改内容会自动保留为本地草稿（重新打开页签可继续编辑），',
    unsavedNotSynced: '但尚未同步到服务器文档。',
    unsavedNotCreated: '该内容还未创建。',
    saveFirst: '是否先保存？',
  },

  /** 项目概况页。 */
  overview: {
    stats: '项目统计',
    apiCount: '接口数',
    apiCaseCount: '接口用例数',
    docCount: '文档数',
    schemaCount: '数据模型数',
    testScenarioCount: '测试场景数',
    recent: '最近编辑',
    recentEmpty: '暂无接口，从右侧新建开始',
    quickCreate: '快捷新建',
  },

  /** 回收站页。 */
  recycle: {
    selectedCount: '已选 {{count}} 项',
    confirmRestore: '确定恢复选中的 {{count}} 项？',
    confirmDelete: '确定彻底删除选中的 {{count}} 项？',
    batchRestore: '批量恢复',
    batchDelete: '批量删除',
    deleteIrreversible: '彻底删除后无法恢复',
    fileName: '文件名称',
    operator: '操作人',
    remaining: '剩余时间',
    confirmRestoreOne: '确定恢复该文件？',
    restore: '恢复',
  },

  /** Markdown 文档页。 */
  markdown: {
    defaultName: '未命名文档',
    saved: '已保存',
    exitEditing: '退出编辑',
  },

  /** 数据模型页。 */
  schema: {
    defaultName: '未命名数据模型',
    namePlaceholder: '数据模型名称，建议使用代码模型名称或同义词',
    confirmDelete: '确定删除数据模型“{{name}}”？',
  },

  /** 接口目录页。 */
  folder: {
    settings: '目录设置',
    allApis: '全部接口',
    name: '目录名称',
    nameRequired: '目录名称不能为空',
    parent: '父级目录',
    apiName: '接口名称',
    method: '请求类型',
    path: '接口路径',
    group: '接口分组',
  },

  /** 接口文档查看/编辑。 */
  doc: {
    tabDoc: '文档',
    tabEdit: '修改文档',
    exampleValue: '示例值',
    exampleValueLabel: '示例值：',
    fieldName: '字段名',
    noFieldDef: '暂无字段定义',
    copyId: '复制 ID',
    clickCopyPath: '点击复制接口地址',
    pathCopied: '接口地址已复制',
    dateFormat: 'YYYY年M月D日',
    apiDescription: '接口说明',
    requestParams: '请求参数',
    pathParams: 'Path 参数',
    queryParams: 'Query 参数',
    headerParams: 'Header 参数',
    cookieParams: 'Cookie 参数',
    noQueryToCopy: '暂无可复制的 Query 参数',
    queryCopied: 'Query 参数已复制',
    copyQuery: '复制 Query',
    requestBody: '请求 Body',
    bodyExample: 'Body 示例',
    bodyParams: 'Body 参数',
    schemaStructure: '参数结构',
    example: '示例',
    bodyExampleCopied: 'Body 示例已复制',
    responses: '返回响应',
    httpStatusLabel: 'HTTP 状态码：',
    contentTypeLabel: '内容格式：',
    responseDescLabel: '响应说明：',
    responseExample: '响应示例',
    descPlaceholder: '支持 Markdown 格式',
    confirmDeleteApi: '确定删除该接口？',
    pathPlaceholder: '接口路径，“/”起始',
    pathHashUnsupported: '接口路径不支持填写\u00A0URL\u00A0hash(#)',
    queryInPathHintPrefix: 'Query\u00A0参数请在下方',
    queryInPathHintSuffix: '中填写',
    queryExtractedPrefix: '路径中\u00A0Query\u00A0参数已自动提取，并填充到下方',
    queryExtractedMiddle: '的\u00A0',
    queryExtractedSuffix: '\u00A0中',
  },

  /** 参数可编辑表格。 */
  paramTable: {
    requestValue: '请求值',
    name: '参数名',
    pathParamHint: '自动提取接口路径里的 {param} 形式参数，请在接口路径中修改。',
    addRow: '添加参数',
    duplicateName: '此列不能重复',
    noFile: '未选择',
    confirmDelete: '删除该参数？',
    deleteRow: '删除参数',
  },

  /** 全局/环境参数参考条。 */
  params: {
    configured: '已配置',
    notConfigured: '未配置',
    globalActive: '运行时会自动带入这些全局参数；同名接口参数优先。',
    inheritedHint: '这些参数来自全局/环境配置，同名接口参数优先。',
    overridden: '已覆盖',
    overriddenSuffix: ' (已覆盖)',
    globalEffective: '全局生效',
    sourceEnv: '环境',
    sourceGlobal: '全局',
    envQueryTitle: '当前全局/环境 Query 参数',
    envHeaderTitle: '当前全局/环境 Header 参数',
    envCookieTitle: '当前全局/环境 Cookie 参数',
    queryTitle: 'Query 参数',
    pathTitle: 'Path 参数',
  },

  /** 动态变量使用说明。 */
  variableHelp: {
    title: '变量使用说明',
    introPrefix: '在请求参数、Header、Body 中输入',
    introSuffix: '即可触发自动补全；内置动态变量每次请求时重新生成，无需定义。',
    columnName: '动态变量',
    columnExample: '示例',
    morePrefix: '此外，',
    /** 变量引用语法示例；值本身就是 `{{变量名}}` 的样子，不由插值填充。 */
    syntaxExample: '{{变量名}}',
    moreMiddle: '可引用环境/全局/会话中已定义的变量（优先级：会话变量 > 环境变量 > 全局变量），在输入框输入',
    moreSuffix: '时同样会出现在补全列表（带当前值）。',
  },

  /** 变量输入高亮。 */
  varHighlight: {
    effectiveValue: '实际生效值：{{value}}',
    undefinedVar: '{{name}} 未定义',
  },

  /** 请求体面板与内容槽位。 */
  body: {
    typeLabel: 'Body 类型',
    comments: '注释',
    fillButton: '一键填充',
    fill: '填充',
    fillTitle: '一键填充 Body？',
    fillContent: '将覆盖当前已输入的内容，填充后不可撤销。',
    noBody: '无 Body',
    none: '无请求体',
    noBodyBody: '该请求没有 Body 体',
    paramsOfType: '{{type}} 参数',
    clear: '清除',
    binaryHint: '选择一个本地文件，其原始字节将作为请求体发送（Content-Type: application/octet-stream）',
    noFileSelected: '未选择文件',
    selectFile: '选择文件',
    noFileWarning: '未选择文件时本次不会发送请求体',
    preservedHint: '已保留 {{type}} 的内容，切回 {{type}} 可恢复',
    globalBodyActive: '运行时会自动带入这些全局 Body 参数；同名接口参数优先。',
    globalBodyInactive: '当前 Body 类型为 {{type}}，这些全局 Body 参数当前不会生效。',
    globalBodyTitle: '当前全局 Body 参数',
    getHeadWarning: 'GET/HEAD 请求不支持携带请求体，已忽略 Body（如需携带请改用 POST，或把参数放进 Query）',
    binaryNoFileWarning: 'binary 类型未选择文件，本次不发送请求体',
    slotParams: '表单参数',
    slotRaw: '正文',
    slotNone: '无请求体',
    noBodySent: '不发送请求体',
    unknownType: '未知 Body 类型「{{type}}」，发送时将不带请求体',
    otherSlots: '另有内容：{{slots}}',
    slotBadge: '{{title}}（{{hint}}）',
    slotJoin: '、',
  },

  /** 运行调试与结果查看。 */
  run: {
    run: '运行',
    requestFailed: '请求失败',
    suggestions: '建议排查方向',
    technicalDetail: '技术详情',
    emptyHint: '填写请求后点击“运行”查看响应',
    notInProject: '当前不在项目页面，无法运行请求',
    runFailed: '运行失败',
    genericSuggestion: '请检查操作是否正确，如果问题持续请尝试重新登录',
    /**
     * 网络错误分类文案。
     *
     * 键与后端 `categorize_request_error()` 的 `error_type` 一一对应
     * （`src-tauri/src/commands/request_runner.rs`）。后端只回错误码，
     * 具体文案由前端按当前语言渲染，因此这里的中文值必须与后端原字符串逐字一致。
     * 新增错误类型时必须同时改后端枚举与两份语言包，`api.run.networkError.*` 的
     * 完整性由 `src/i18n/i18n-request-errors.test.ts` 校验。
     */
    networkError: {
      dns_failure: {
        message: 'DNS 解析失败，无法找到服务器地址',
        suggestion: ['请检查 URL 中的域名是否正确', '检查网络连接是否正常', '尝试使用 IP 地址代替域名'],
      },
      connection_refused: {
        message: '连接被服务器拒绝',
        suggestion: ['请确认目标服务器已启动', '检查端口号是否正确', '确认防火墙未阻止连接'],
      },
      connection_reset: {
        message: '连接被重置',
        suggestion: ['请检查网络连接是否稳定', '目标服务器可能主动断开了连接'],
      },
      network_unreachable: {
        message: '网络不可达',
        suggestion: ['请检查网络连接是否正常', '确认目标地址是否在本地网络中'],
      },
      connection_failed: {
        message: '无法连接到服务器',
        suggestion: ['请检查网络连接和 URL 是否正确', '确认目标服务器是否在线'],
      },
      timeout: {
        message: '请求超时',
        suggestion: ['目标服务器响应过慢，请稍后重试', '检查网络连接是否稳定', '确认目标服务器是否负载过高'],
      },
      tls_error: {
        message: 'TLS/SSL 证书验证失败',
        suggestion: ['请确认服务器 SSL 证书是否有效', '检查系统时间是否准确', '如果使用自签名证书，需要配置信任'],
      },
      http_error: {
        message: 'HTTP 响应状态异常',
        suggestion: ['请检查请求参数是否正确'],
      },
      redirect_error: {
        message: '重定向处理失败',
        suggestion: ['请检查请求 URL 是否被重定向到无效地址'],
      },
      body_error: {
        message: '请求体发送失败',
        suggestion: ['请检查请求体数据是否过大或格式不正确'],
      },
      unknown: {
        message: '请求异常',
        suggestion: ['请检查网络和请求配置', '如果问题持续，请查看技术详情进行排查'],
      },
    },
    tabResponseBody: '响应内容',
    noResponseBody: '无响应体',
    /** 带计数的表头标题，如「响应头 (3)」。 */
    headersCount: '{{label}} ({{count}})',
    tabResponseHeaders: '响应头',
    noResponseHeaders: '无响应头',
    tabRequestBody: '请求内容',
    noRequestBody: '无请求体',
    tabRequestHeaders: '请求头',
    noRequestHeaders: '无请求头',
    headerNotSent: '常见客户端默认，reqwest 实际未发送',
    noCurl: '无 cURL 命令',
    exportMarkdown: '导出 Markdown',
    reportFileName: '接口报告-{{status}}-{{ts}}.md',
    compareHistory: '对比历史',
    showRaw: '查看原始',
    formatJson: '格式化 JSON',
    moreActions: '更多操作',
    proxyTooltip: '代理: {{value}}',
    proxyLabel: '{{type}} 代理',
    diffTitle: '响应对比（当前 vs 历史）',
    diffLeftTitle: '历史响应',
    diffRightTitle: '当前响应',
    diffOriginal: '原始',
    diffCompare: '对比',
    noDiffContent: '无可对比内容',
    savedToDoc: '已保存到接口文档',
    saveToDoc: '保存到文档',
    saveToDocTitle: '保存到接口文档？',
    saveToDocContent: '将用当前运行时配置覆盖文档定义:Query/Header/Cookie 参数、请求体、前置/后置脚本与超时设置。',
    saveToDocOk: '覆盖保存',
    savedAsQuickRequest: '运行后已保存为快捷请求',
    resetTitle: '一键复原',
    resetConfirm: '确定要放弃所有临时修改，恢复为文档定义的原始值吗？',
    resetConfirmOk: '确认复原',
    resetSource: '请选择复原来源：',
    resetToDoc: '复原到文档定义',
    resetToSaved: '复原到保存点',
    resetToSavedPointDone: '已复原到上次保存点',
    resetToDocDone: '已复原为文档原始值',
    resetHint: '复原为文档原始值（清除所有临时修改：参数、请求头、Body、脚本等）',
    verifyCert: '校验证书',
    sslOffHint: '不校验 HTTPS 证书：可调试自签名证书接口，但不推荐用于生产环境',
    sslOnHint: '校验 HTTPS 证书：验证服务器证书有效性',
    sslOffShortHint: 'HTTPS 证书验证已关闭，不推荐用于生产环境',
    sslOnShortHint: '开启后将验证 HTTPS 证书，关闭可调试自签名证书接口',
    timeoutHint: '请求超时（秒），留空使用全局默认，0 表示不限时',
    timeoutPlaceholder: '超时',
    pathPlaceholderWithEnv: '输入路径（如 /users）或完整 URL',
    urlPlaceholder: '输入完整 URL，如 https://api.example.com/users',
    urlInputHint: '两种输入方式：\n1. 输入相对路径（如 /users），请求时自动拼接环境 baseUrl；\n2. 输入完整 URL（以 http:// 或 https:// 开头），请求直接使用该地址，不再拼接环境 baseUrl。',
    urlInputHintNoEnv: '请输入完整 URL，如 https://api.example.com/users',
    fullUrlHint: '已输入完整 URL，请求将直接使用该地址，不再拼接环境 baseUrl',
    fullUrl: '完整 URL',
    fileFilter: '文件',
    fileSaved: '文件已保存',
    saveFailed: '保存失败',
    binarySize: '{{size}}KB ({{bytes}} 字节)',
    binaryResponse: '二进制响应',
    saveToLocal: '保存到本地',
    responseImageAlt: '响应图片',
    svgHint: 'SVG 图片（点击保存按钮下载）',
    binaryPreviewHint: '该响应为二进制内容，不支持文本预览，请保存到本地查看',
    largeBodyRawPrefix: '响应体',
    largeBodyRawSuffix: '，已显示原始数据，',
    forceFormat: '强制格式化',
    forceFormatted: '已强制格式化 {{size}} 的响应体，可能影响性能',
    /** 报告导出（下载的 .md 文件内容）。 */
    report: {
      title: '# 接口请求报告',
      overview: '## 概览',
      method: '- **方法**：{{method}}',
      url: '- **URL**：{{url}}',
      status: '- **状态**：{{status}} {{statusText}}',
      duration: '- **耗时**：{{ms}} ms',
      requestHeaders: '## 请求头',
      query: '## Query 参数',
      requestBody: '## 请求体',
      responseHeaders: '## 响应头',
      responseBody: '## 响应体',
      none: '_无_',
      tableHeader: '| 名称 | 值 |\n| --- | --- |',
    },
  },

  /** 运行历史。 */
  history: {
    title: '历史记录',
    total: '共 {{count}} 条',
    apply: '回填',
    compare: '对比',
    empty: '暂无历史记录',
    selectHint: '点击左侧记录查看详情',
    request: '请求',
    requestHeaders: '请求头 ({{count}})',
    queryParams: 'Query 参数 ({{count}})',
    requestBody: '请求体',
    requestBodyParams: '请求体参数 ({{count}})',
    response: '响应',
    responseHeaders: '响应头 ({{count}})',
    diffTitle: '历史记录对比',
    pickTitle: '选择历史记录对比',
    loadFailed: '获取历史记录失败',
    applied: '已回填历史请求',
  },

  /** 前后置脚本。 */
  script: {
    preScript: '前置脚本',
    postScript: '后置脚本',
    noOutput: '暂无输出',
    consoleTruncated: '... 还有 {{count}} 条日志未显示',
    noTestResults: '暂无测试结果',
    testResults: '测试结果',
    passed: '通过',
    failed: '失败',
    helpButton: '使用说明',
    helpTitle: '脚本使用说明',
    aiTitle: '需要 AI 帮你写脚本？',
    aiDesc: '复制下方 Prompt 给 AI，再描述你的需求即可生成代码',
    copyPrompt: '复制 Prompt',
    promptCopied: '已复制到剪贴板，粘贴给 AI 即可',
    copyFailed: '复制失败，请手动复制',
    introPrefix: '在脚本中使用',
    introSuffix: '对象操作变量、修改请求、读取响应、运行断言。',
    timeout: '脚本执行超时（{{ms}}ms）',
    preFailed: '前置脚本执行失败: {{error}}',
    preError: '前置脚本执行异常: {{error}}',
    postFailed: '后置脚本执行失败: {{error}}',
    postError: '后置脚本执行异常: {{error}}',
    help: {
      envVariables: '环境变量',
      globals: '全局变量',
      variables: '临时变量',
      requestOps: '请求操作（前置脚本）',
      responseOps: '响应操作（后置脚本）',
      assertions: '测试断言',
      console: '控制台输出',
      envGet: '获取环境变量值',
      envSet: '设置环境变量（会话级共享，可跨请求使用）',
      envUnset: '删除环境变量',
      envHas: '检查环境变量是否存在',
      globalsGet: '获取全局变量值',
      globalsSet: '设置全局变量',
      globalsUnset: '删除全局变量',
      variablesGet: '获取临时变量值（仅本次请求生命周期）',
      variablesSet: '设置临时变量',
      requestUrl: '当前请求 URL',
      requestMethod: '当前请求方法',
      requestHeadersUpsert: '添加或修改请求头',
      requestHeadersRemove: '删除请求头',
      requestHeadersGet: '获取请求头值',
      requestBodyUpdate: '更新请求体内容',
      responseCode: 'HTTP 状态码',
      responseStatus: '状态文本',
      responseJson: '解析响应体为 JSON 对象',
      responseText: '获取响应体原始文本',
      responseTime: '响应时间（毫秒）',
      responseHeadersGet: '获取响应头值',
      testDeclare: '声明测试用例，fn 中使用 pm.expect 断言',
      expectEqual: '断言值相等',
      expectDeepEqual: '断言深度相等',
      expectProperty: '断言对象包含属性',
      expectTrue: '断言为 true',
      expectNotEqual: '断言不相等',
      consoleLog: '输出日志',
      consoleWarn: '输出警告',
      consoleError: '输出错误',
    },
    aiPrompt: `你是一个 API 测试脚本编写助手。我正在使用 ApiMocktle（一个本地 API 管理桌面应用），它支持在请求前后执行 JavaScript 脚本。

## 脚本类型

- **前置脚本**：在请求发送前执行，可修改请求参数、添加认证头等
- **后置脚本**：在请求收到响应后执行，可解析响应、提取数据、运行断言

## 可用 API

### 环境变量（会话级共享，可跨请求使用）
- pm.env.get(key) - 获取
- pm.env.set(key, value) - 设置
- pm.env.unset(key) - 删除
- pm.env.has(key) - 检查是否存在

### 全局变量
- pm.globals.get(key) / .set(key, value) / .unset(key) / .has(key)

### 临时变量（仅本次请求生命周期）
- pm.variables.get(key) / .set(key, value)

### 请求操作（前置脚本可用）
- pm.request.url - 当前请求 URL
- pm.request.method - 请求方法
- pm.request.headers.upsert({ key, value }) - 添加/修改请求头
- pm.request.headers.remove(key) - 删除请求头
- pm.request.headers.get(key) - 获取请求头
- pm.request.body.update(newBody) - 更新请求体

### 响应操作（后置脚本可用）
- pm.response.code - HTTP 状态码
- pm.response.status - 状态文本
- pm.response.json() - 解析为 JSON
- pm.response.text() - 原始文本
- pm.response.responseTime - 响应时间（ms）
- pm.response.headers.get(key) - 获取响应头

### 测试断言（后置脚本可用）
- pm.test(name, fn) - 声明测试用例
- pm.expect(value).to.equal(expected) - 相等
- pm.expect(value).to.deep.equal(obj) - 深度相等
- pm.expect(obj).to.have.property(key) - 包含属性
- pm.expect(value).to.be.true / .to.be.false

### 控制台输出
- console.log() / console.warn() / console.error()

### 时间函数（JavaScript 标准 API）
- Date.now() - 当前时间戳
- new Date() - 日期对象

## 常见场景示例

### 1. Token 自动刷新
前置脚本：
\`\`\`javascript
const token = pm.env.get('authToken')
if (token) {
  pm.request.headers.upsert({ key: 'Authorization', value: \`Bearer \${token}\` })
}
\`\`\`

后置脚本（提取 token 并保存）：
\`\`\`javascript
const json = pm.response.json()
if (json.data?.token) {
  pm.env.set('authToken', json.data.token)
  console.log('Token 已更新')
}
\`\`\`

### 2. 响应断言
\`\`\`javascript
pm.test('状态码应为 200', () => {
  pm.expect(pm.response.code).to.equal(200)
})

pm.test('应返回 success 字段', () => {
  const json = pm.response.json()
  pm.expect(json).to.have.property('success')
  pm.expect(json.success).to.be.true
})
\`\`\`

### 3. 链式请求（从响应提取 ID 用于下一个请求）
\`\`\`javascript
const json = pm.response.json()
if (json.data?.id) {
  pm.env.set('userId', json.data.id)
  console.log(\`提取到 userId: \${json.data.id}\`)
}
\`\`\`

### 4. 动态签名
\`\`\`javascript
const timestamp = Date.now()
const sign = btoa(\`\${timestamp}:\${pm.request.url}\`)
pm.request.headers.upsert({ key: 'X-Sign', value: sign })
pm.request.headers.upsert({ key: 'X-Timestamp', value: String(timestamp) })
\`\`\`

## 变量使用说明

优先使用环境变量存储需要跨请求共享的数据。在请求参数（Params/Headers/Cookie）或 Body 中，可以直接使用 \`{{变量名}}\` 语法引用变量，请求发送时会自动替换为实际变量值。

示例：
- Header 中：\`Authorization: Bearer {{authToken}}\`
- Query 中：\`?userId={{userId}}\`
- Body 中：\`{ "token": "{{authToken}}" }\`

变量优先级（从高到低）：会话变量 > 环境变量 > 全局变量

内置动态变量（\`{{$xxx}}\`，每次请求时重新生成，无需定义）：
- \`{{$timestamp}}\` 秒级时间戳 | \`{{$timestampISO}}\` ISO 8601 时间
- \`{{$guid}}\` UUID（带横线） | \`{{$randomUUID}}\` UUID（无横线）
- \`{{$randomInt}}\` 0-1000 随机数 | \`{{$randomEmail}}\` 随机邮箱
- \`{{$randomIP}}\` 随机 IPv4 | \`{{$randomMobile}}\` 随机手机号 | \`{{$randomString}}\` 8 位随机字符串

请根据我的需求编写脚本代码，直接给出可粘贴的代码即可。`,
  },

  /** cURL 导入与解析。 */
  curl: {
    unsupportedMethod: '暂不支持的请求方法：{{method}}',
    unknown: '未知',
    invalidUrl: '未识别到有效的请求 URL',
    getOnlyQueryOrForm: 'GET 形式的 cURL 仅支持 URL 查询参数或 x-www-form-urlencoded 数据',
    invalidHeader: 'Header 格式非法：{{line}}',
    jsonBodyParseFailed: 'JSON Body 解析失败，请检查 cURL 中的请求体格式',
  },
}
