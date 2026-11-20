/** 通用 UI 组件：JSON Schema 编辑器、表格、主题编辑器、编辑器外壳、图标与 Toast。 */
export const ui = {
  /** JSON Schema 树形编辑器与模型生成卡片。 */
  schema: {
    /** `ref` 类型的展示名；其余 Schema 类型名是协议常量，不翻译。 */
    refModel: '引用模型',
    /** 根节点行的名称标签。 */
    rootNode: '根节点',
    /** 空字段提示的前半句，后半句 `addField` 是可点击的「添加」。 */
    emptyHint: '没有字段，',
    addField: '添加',
    /** 引用模型节点悬停时出现的解除关联按钮。 */
    unbind: '解除关联',
    refNotFound: '模型未找到: {{ref}}',
    /** 文档表格里解析不到 `$ref` 时补的说明列文案。 */
    refMissing: '引用模型未找到',
    /** 可空类型的展示模板，`{{label}}` 为类型名。 */
    nullable: '{{label}}（可空）',

    /** 列头。 */
    columns: {
      name: '字段名',
      type: '类型',
      displayName: '中文名',
      example: '示例值',
      required: '必填',
      description: '说明',
    },

    /** 单元格占位符。 */
    placeholder: {
      name: '字段名',
      displayName: '中文名',
      example: '示例值',
      description: '说明',
    },

    /** 只读态下的必填标记。 */
    requiredLabel: '必填',
    optionalLabel: '可选',

    addChildNode: '添加子节点',
    addSiblingNode: '添加相邻节点',
    /** 类型下拉右上角的高级设置入口。 */
    advancedSettings: '高级设置',
    selectRefModel: '请选择引用的模型',

    /** 模型生成 / 查看弹窗。 */
    card: {
      generate: '生成',
      view: '查看',
      inputJson: '输入 JSON',
      inputJsonSchema: '输入 JSON Schema',
      generateSchema: '生成 Schema',
      generateExample: '生成示例',
      generatedSchemaPreview: '生成的 Schema 预览',
      generatedJsonExample: '生成的 JSON 示例',
      apply: '应用',
      copyCode: '复制代码',
      jsonExampleTab: 'JSON 示例',
      invalidJson: 'JSON 格式不正确，请检查！',
      invalidJsonSchema: 'JSON Schema 格式不正确，请检查！',
      schemaApplied: 'Schema 已应用',
    },
  },

  /** JSON 预览。 */
  jsonViewer: {
    invalidJson: '示例不是合法 JSON，按原始文本显示',
  },

  /** Monaco 代码编辑器外壳。 */
  monaco: {
    loading: '初次加载可能耗时较久，请耐心等待...',
  },

  /** bytemd Markdown 编辑器（第三方组件语言包，按当前语言派生）。 */
  markdown: {
    bold: '粗体',
    boldText: '粗体文本',
    cheatsheet: 'Markdown 语法',
    closeHelp: '关闭帮助',
    closeToc: '关闭目录',
    code: '代码',
    codeBlock: '代码块',
    codeLang: '编程语言',
    codeText: '代码',
    exitFullscreen: '退出全屏',
    exitPreviewOnly: '恢复默认',
    exitWriteOnly: '恢复默认',
    fullscreen: '全屏',
    h1: '一级标题',
    h2: '二级标题',
    h3: '三级标题',
    h4: '四级标题',
    h5: '五级标题',
    h6: '六级标题',
    headingText: '标题',
    help: '帮助',
    hr: '分割线',
    image: '图片',
    imageAlt: 'alt',
    imageTitle: '图片描述',
    italic: '斜体',
    italicText: '斜体文本',
    limited: '已达最大字符数限制',
    lines: '行数',
    link: '链接',
    linkText: '链接描述',
    ol: '有序列表',
    olItem: '项目',
    preview: '预览',
    previewOnly: '仅预览区',
    quote: '引用',
    quotedText: '引用文本',
    shortcuts: '快捷键',
    source: '源代码',
    sync: '同步滚动',
    toc: '目录',
    top: '回到顶部',
    ul: '无序列表',
    ulItem: '项目',
    words: '字数',
    write: '编辑',
    writeOnly: '仅编辑区',
  },

  /** 主题编辑器：配色模式。 */
  theme: {
    label: '主题',
    light: '浅色',
    dark: '暗色',
  },

  /** 设计风格选择器。内部枚举值用作 key，展示名与说明翻译。 */
  designStyle: {
    label: '设计风格',
    default: {
      name: '默认',
      description: '经典 Ant Design 风格，简洁高效，适合日常开发',
    },
    glassmorphism: {
      name: '毛玻璃',
      description: '半透明模糊与光晕背景，质感通透，适合展示与演示',
    },
    skeuomorphism: {
      name: '拟物化',
      description: '真实材质纹理与立体光影，适合偏好实物质感',
    },
    neumorphism: {
      name: '新拟态',
      description: '柔和浮雕与低对比投影，视觉温和不刺眼',
    },
  },

  /** 界面密度选择器。 */
  density: {
    label: '界面密度',
    compact: {
      name: '紧凑',
      description: '控件更矮、字号更小、间距更紧，一屏容纳更多信息（默认）',
    },
    standard: {
      name: '标准',
      description: '接近系统默认尺寸，兼顾密度与可读性',
    },
    loose: {
      name: '宽松',
      description: '控件更高、留白更多，长时间盯屏更护眼',
    },
  },
}
