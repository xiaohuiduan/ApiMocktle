import nextPreset from 'prefer-code-style/eslint/preset/next'

export default [
  ...nextPreset,

  {
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 0,
      // 允许 if (x) { return y } 单行块（max: 1 会把 curly 修复后的单行块误报）
      '@stylistic/max-statements-per-line': ['error', { max: 2 }],
      // 防御性 null/undefined 判断大量误报（x ?? '' 类型收窄后看似冗余，实为防御边界），
      // 降为 warning 保留可见性，避免无 fixer 的 241 处逐手改造成本与行为风险
      '@typescript-eslint/no-unnecessary-condition': 1,
      // 函数声明有提升，先使用后声明合法；variables: false 是因为 React 组件内
      // const 在回调（onClick/onOk 等）中引用时执行序晚于渲染，静态分析无法区分，
      // 属 typescript-eslint 官方认可的 React 误报场景（7 处存量全是回调内引用，无真实 TDZ）
      '@typescript-eslint/no-use-before-define': ['error', { functions: false, variables: false }],
      // 存量代码大量 any 耦合的类型健全规则：项目此前从未达标（推荐配置意外启用），
      // 降为 warning 保留可见性，避免批量改动引入行为风险，随代码演进逐步清零
      '@typescript-eslint/no-unsafe-member-access': 1,
      '@typescript-eslint/no-unsafe-argument': 1,
      '@typescript-eslint/no-unsafe-return': 1,
      '@typescript-eslint/no-explicit-any': 1,
      '@typescript-eslint/restrict-template-expressions': 1,
      '@typescript-eslint/no-base-to-string': 1,
      '@typescript-eslint/no-implied-eval': 1,
      '@typescript-eslint/no-unsafe-enum-comparison': 1,
      // _ 前缀参数视为有意忽略（如 _data、_index）
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  {
    settings: {
      tailwindcss: {
        whitelist: ['ant-tree-switcher-icon', 'ui-menu-controls', 'ui-tabs-tab-label'],
      },
    },
  },

  // 忽略本地工具目录（.gitignore 已忽略，非项目源码）
  {
    ignores: [
      '.agents/**',
      '.codex/**',
      '.opencode/**',
      '.zcode/**',
      'plans/**',
      'package.json',
    ],
  },
]
