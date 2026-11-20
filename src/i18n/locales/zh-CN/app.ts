/** 应用外壳：登录注册、项目列表、主导航、标签栏、全局 hooks 与 contexts 文案。 */
export const app = {
  /**
   * 系统生成的默认名称。
   *
   * 这些名字会被写入草稿与数据库（属内容数据，不随语言回改），
   * 但同时被 `menu-drafts.ts` 用作「用户是否真的命名过」的判定依据，
   * 因此中英文两套都要登记在判定集合里，见 `src/i18n/default-names.ts`。
   */
  defaultNames: {
    api: '新建接口',
    apiFallback: '未命名接口',
    quickRequest: '新建快捷请求',
    quickRequestFallback: '快捷请求',
    doc: '新建 Markdown',
    schema: '新建数据模型',
  },

  /** 跨模块复用的校验提示。 */
  validation: {
    minChars: '至少 {{count}} 个字符',
  },

  auth: {
    brandSubtitle: '本地 API 管理工具',
    privacyNotice: '本软件为纯本地应用，你的所有数据（包括账号）仅保存在这台电脑上，不会上传到任何服务器。',
    tabLogin: '登录',
    tabRegister: '注册',
    username: '用户名',
    usernamePlaceholder: '请输入用户名',
    usernameRequired: '请输入用户名',
    password: '密码',
    passwordPlaceholder: '请输入密码',
    passwordRequired: '请输入密码',
    rememberPassword: '记住账号密码',
    keepLoggedIn: '保持登录状态',
    loginDuration: '登录状态时长',
    rememberHint: '“记住账号密码”会在本机保存凭据；“保持登录状态”会延长会话有效期。',
    submitLogin: '登录',
    submitRegister: '注册',
    noAccount: '没有账号？',
    hasAccount: '已有账号？',
    goRegister: '去注册',
    goLogin: '去登录',
    loginSuccess: '登录成功',
    registerSuccess: '注册成功',
    rememberDays: {
      one: '1 天',
      three: '3 天',
      seven: '7 天',
      thirty: '30 天',
      forever: '永久',
    },
    /** 修改密码（用户菜单）。 */
    changePassword: {
      title: '修改密码',
      oldPassword: '旧密码',
      oldPasswordPlaceholder: '请输入旧密码',
      oldPasswordRequired: '请输入旧密码',
      newPassword: '新密码',
      newPasswordPlaceholder: '请输入新密码',
      newPasswordRequired: '请输入新密码',
      confirmPassword: '确认新密码',
      confirmPasswordPlaceholder: '请再次输入新密码',
      confirmPasswordRequired: '请确认新密码',
      submit: '确认修改',
      mismatch: '两次新密码不一致',
      success: '密码修改成功',
    },
  },

  /** 左侧主导航。 */
  nav: {
    home: '接口管理',
    tests: '自动测试',
    settings: '项目配置',
  },

  /** 主框架外壳。 */
  shell: {
    globalSettings: '全局设置',
    expandSidePanel: '展开目录面板',
  },

  /** 底部状态栏。 */
  footer: {
    unsavedTabsTip: '{{count}} 个页签有未保存的修改',
    unsavedCount: '{{count}} 未保存',
  },

  /** 用户菜单。 */
  userMenu: {
    projects: '项目列表',
    changePassword: '修改密码',
    logout: '退出登录',
  },

  /** 变量管理面板。 */
  sessionVars: {
    title: '变量管理',
    viewTooltip: '查看变量',
    session: '会话变量',
    scriptTag: '脚本设置',
    clear: '清空',
    emptySession: '暂无会话变量',
    environment: '环境变量',
    emptyEnvironment: '暂无环境变量',
    global: '全局变量',
    emptyGlobal: '暂无全局变量',
    nameColumn: '变量名',
    valueColumn: '值',
  },

  /** 项目列表页与项目切换器。 */
  projects: {
    title: '项目列表',
    create: '新建项目',
    createTitle: '新建项目',
    editTitle: '编辑项目',
    empty: '还没有项目',
    name: '项目名称',
    namePlaceholder: '请输入项目名称',
    nameRequired: '请输入项目名称',
    icon: '项目图标',
    openAria: '打开项目 {{name}}',
    loadFailed: '加载失败',
    createFailed: '创建失败',
    updateFailed: '更新失败',
    deleteFailed: '删除失败',
    updated: '项目已更新',
    deleted: '项目已删除',
    deleteConfirmTitle: '删除项目"{{name}}"？',
    deleteConfirmContent: '项目下的成员、接口、环境和回收站数据都会被彻底删除。',
    role: {
      owner: '拥有者',
      editor: '编辑者',
      viewer: '查看者',
    },
    stat: {
      api: 'API {{count}}',
      schema: '模型 {{count}}',
      request: '快捷请求 {{count}}',
      test: '自测 {{count}}',
    },
    iconPicker: {
      all: '全部',
      searchPlaceholder: '搜索...',
      empty: '暂无图标',
    },
    quickSwitch: {
      fallbackMark: '项',
      placeholder: '快速切换项目',
      searchPlaceholder: '搜索项目',
      roleLine: '角色：{{role}}',
      viewList: '查看项目列表',
    },
  },

  /** 项目标签栏。 */
  tabBar: {
    saving: '保存中',
    saveFailed: '保存失败',
    unsaved: '有未保存修改',
    close: '关闭标签页',
    closeOthers: '关闭其他标签页',
    closeRight: '关闭右侧标签页',
    closeAll: '全部关闭',
    copyName: '复制项目名称',
    closeConfirmTitle: '关闭项目“{{name}}”？',
    closeOthersConfirmTitle: '关闭其他项目？',
    closeRightConfirmTitle: '关闭右侧项目？',
    closeAllConfirmTitle: '关闭全部项目？',
    dirtySummary: '该项目存在未保存的修改。关闭后内容会保留为草稿，重新打开项目时可继续编辑。',
    dirtyNamesLabel: '未保存内容：',
    dirtyNamesSeparator: '、',
    unsavedBadge: '有未保存修改',
    newProject: '新建项目',
    environmentLabel: '环境',
    environmentPlaceholder: '选择环境',
    manageEnvironment: '管理环境',
    refresh: '刷新',
    projectList: '项目列表',
  },

  /** 自动化测试任务列表页。 */
  tests: {
    title: '自动化测试',
    allTasks: '全部任务',
    defaultFolder: '默认',
    folderLabel: '文件夹',
    newFolder: '新建文件夹',
    folderName: '文件夹名称',
    folderNamePlaceholder: '请输入文件夹名称',
    folderNameRequired: '请输入文件夹名称',
    rename: '重命名',
    deleteFolderTitle: '删除文件夹',
    deleteFolderContent: '确定删除「{{name}}」？其中的任务将移回默认。',
    folderCreated: '文件夹已创建',
    folderDeleted: '文件夹已删除，其中的任务已移回默认',
    createTask: '创建测试任务',
    createFirstTask: '创建第一个测试任务',
    confirmCreate: '创建',
    taskName: '任务名称',
    taskNamePlaceholder: '请输入任务名称',
    taskNameRequired: '请输入任务名称',
    description: '描述',
    descriptionPlaceholder: '请输入任务描述',
    failFast: '失败即停',
    status: '状态',
    createdAt: '创建时间',
    action: '操作',
    edit: '编辑',
    move: '移动',
    delete: '删除',
    deleteConfirm: '确定要删除这个测试任务吗？',
    editTitle: '编辑测试任务',
    empty: '暂无测试任务',
    total: '共 {{total}} 条',
    created: '测试任务创建成功',
    updated: '任务信息已更新',
    deleted: '删除成功',
    moved: '已移动',
    invalidParams: '参数错误',
    statusLabel: {
      idle: '待执行',
      running: '执行中',
      passed: '通过',
      failed: '失败',
      aborted: '已中止',
    },
  },

  /** 回收站。 */
  recycle: {
    remainingDays: '{{days}}天',
  },

  /** 环境与目录默认值。 */
  environment: {
    newEnvironment: '新建环境',
  },

  catalog: {
    root: '根目录',
    createNew: '新建目录',
  },

  /** 项目图标分类名（`AI` 是技术缩写，不进语言包）。 */
  iconCategory: {
    account: '账号',
    media: '媒体',
    business: '商业',
    life: '生活',
    doc: '文档',
    tools: '工具',
  },

  /** YAPI 推送通知。 */
  yapiPush: {
    created: '新增 {{count}} 条',
    merged: '合并 {{count}} 条',
    detailSeparator: '，',
    withDetails: '已接收 {{summary}} 次推送：{{details}}，点击刷新后可见',
    withoutDetails: '已接收 {{summary}} 次推送，点击刷新后可见',
    title: '项目 {{name}} 有更新',
    refreshNow: '立即刷新',
    goView: '去查看',
  },

  /** 生成的接口文档/示例中的固定标注（「必填 / 可选」复用 `common.required / common.optional`）。 */
  document: {
    requiredComment: '  // (必填)',
    circularReference: '(循环引用)',
    unresolvedRef: '(未找到: {{ref}})',
    noFieldDefinition: '    (无字段定义)',
    sectionQuery: 'Query 参数',
    sectionPath: '路径参数',
    sectionHeader: '请求头',
  },

  /** 全局 hooks / contexts 的错误与异常提示。 */
  errors: {
    requestFailed: '请求失败',
    notInProject: '当前不在项目页面',
    restoreFailed: '还原失败,请重试',
    deleteFailed: '删除失败,请重试',
    createFailed: '新增失败,请重试',
    moveFailed: '移动失败,请重试',
    projectExpired: '当前项目或登录状态已失效，请刷新后重试',
    tabExists: '已存在相同的页签。',
    unhandledType: '未处理的类型：{{type}}',
    missingRouteParam: '{{param}} 缺失',
    testTasksLoadFailed: '获取测试任务列表失败',
  },
}
