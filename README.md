# ApiMocktle

**Mock**（模拟，类似鹦鹉学舌，突出 API 模拟能力）+ **Turtle**（龟，象征数据结构稳定）→ **Mocktle**。一个基于 **Tauri v2 + React + Rust + SQLite** 的本地优先 API 管理桌面应用。

当然上面的名字是先射箭画靶，AI给我取得，真实原因是因为我养了鹦鹉🦜和乌龟🐢，然后Deepseek给我取了这个名字

它把注册登录、项目管理、接口目录、文档与数据模型编辑、环境变量、请求调试、**自动化测试流程编排**、Swagger/OpenAPI 导入导出、**局域网文档分享**等能力整合到一个可离线运行的桌面应用里，数据完全掌握在用户本地，支持 **MCP 服务（AI Agent 集成）**。

## 界面预览

> 点击缩略图可查看大图

| 模块 | 功能 1 | 功能 2 | 功能 3 | 功能 4 |
| --- | --- | --- | --- | --- |
| **项目管理** | **项目列表**<br/>卡片展示 API/模型/快捷请求/自测数量与角色权限<br/><a href="assets/readme/01-projects.png"><img src="assets/readme/01-projects.png" width="300" alt="项目列表"/></a> | **新建项目**<br/>项目名称 + 885 个图标选择<br/><a href="assets/readme/02-project-create.png"><img src="assets/readme/02-project-create.png" width="300" alt="新建项目"/></a> | **编辑项目**<br/>修改名称与图标<br/><a href="assets/readme/03-project-edit.png"><img src="assets/readme/03-project-edit.png" width="300" alt="编辑项目"/></a> | **快速切换**<br/>多项目标签栏 + 搜索切换<br/><a href="assets/readme/04-project-tabs.png"><img src="assets/readme/04-project-tabs.png" width="300" alt="项目切换"/></a> |
| **接口文档** | **接口文档**<br/>树形目录 + 参数表格 + 多状态码响应<br/><a href="assets/readme/05-api-doc.png"><img src="assets/readme/05-api-doc.png" width="300" alt="接口文档"/></a> | **接口编辑**<br/>Query/Path/Header/Cookie 与 6 种 Body 类型<br/><a href="assets/readme/06-api-edit.png"><img src="assets/readme/06-api-edit.png" width="300" alt="接口编辑"/></a> | **Schema 编辑**<br/>请求体/响应 JSON Schema 树形编辑器<br/><a href="assets/readme/07-api-schema.png"><img src="assets/readme/07-api-schema.png" width="300" alt="Schema 编辑"/></a> | **数据模型**<br/>`$ref` 跨接口复用模型定义<br/><a href="assets/readme/08-api-model.png"><img src="assets/readme/08-api-model.png" width="300" alt="数据模型"/></a> |
| **接口运行** | **运行参数**<br/>环境变量解析、参数覆盖、body 切换不丢文本<br/><a href="assets/readme/09-api-run.png"><img src="assets/readme/09-api-run.png" width="300" alt="运行参数"/></a> | **运行结果**<br/>格式化 JSON 响应 + 耗时<br/><a href="assets/readme/10-api-run-result.png"><img src="assets/readme/10-api-run-result.png" width="300" alt="运行结果"/></a> | **请求响应头**<br/>实际发出请求头 + 响应头、cURL 一键复制<br/><a href="assets/readme/11-api-headers.png"><img src="assets/readme/11-api-headers.png" width="300" alt="请求响应头"/></a> | **运行历史**<br/>自动保存最近 10 条，一键回填<br/><a href="assets/readme/12-api-history.png"><img src="assets/readme/12-api-history.png" width="300" alt="运行历史"/></a> |
| **自动化测试** | **任务列表**<br/>文件夹分组 + 状态/失败即停管理<br/><a href="assets/readme/13-test-tasks.png"><img src="assets/readme/13-test-tasks.png" width="300" alt="任务列表"/></a> | **流程画布**<br/>9 种节点拖拽编排 + ELK 自动布局<br/><a href="assets/readme/14-flow-canvas.png"><img src="assets/readme/14-flow-canvas.png" width="300" alt="流程画布"/></a> | **节点配置**<br/>请求覆盖/断言/提取器可视化编辑<br/><a href="assets/readme/15-flow-config.png"><img src="assets/readme/15-flow-config.png" width="300" alt="节点配置"/></a> | **流程运行**<br/>环境选择 + 单节点调试 + 实时日志<br/><a href="assets/readme/16-flow-run.png"><img src="assets/readme/16-flow-run.png" width="300" alt="流程运行"/></a> |
| **环境管理** | **环境空间**<br/>全局变量 / 密钥统一维护<br/><a href="assets/readme/17-env-global.png"><img src="assets/readme/17-env-global.png" width="300" alt="环境空间"/></a> | **全局参数**<br/>Header/Query/Cookie/Body 全局参数<br/><a href="assets/readme/18-env-params.png"><img src="assets/readme/18-env-params.png" width="300" alt="全局参数"/></a> | **环境编辑**<br/>前置 URL + 环境变量 + 全局参数<br/><a href="assets/readme/19-env-edit.png"><img src="assets/readme/19-env-edit.png" width="300" alt="环境编辑"/></a> | **环境切换**<br/>顶部工具栏随时切换环境<br/><a href="assets/readme/20-env-switch.png"><img src="assets/readme/20-env-switch.png" width="300" alt="环境切换"/></a> |
| **文档分享** | **分享面板**<br/>局域网分享服务 + 链接列表<br/><a href="assets/readme/21-share-panel.png"><img src="assets/readme/21-share-panel.png" width="300" alt="分享面板"/></a> | **新建分享**<br/>标题 / 密码 / 过期时间<br/><a href="assets/readme/22-share-create.png"><img src="assets/readme/22-share-create.png" width="300" alt="新建分享"/></a> | **选择范围**<br/>分享全部或勾选指定接口<br/><a href="assets/readme/23-share-scope.png"><img src="assets/readme/23-share-scope.png" width="300" alt="选择范围"/></a> | **编辑分享**<br/>保留/设置/移除访问密码<br/><a href="assets/readme/24-share-edit.png"><img src="assets/readme/24-share-edit.png" width="300" alt="编辑分享"/></a> |
## 功能特性

### 接口管理
- 树形目录：拖拽排序、重命名、复制、移动、删除、回收站恢复
- 资源类型：API 接口 / Markdown 文档 / 数据模型 / 快捷请求
- 接口编辑：路径、Query/Path/Header/Cookie 参数，Body 支持 JSON / XML / form-data / url-encoded / raw / binary
- Body JSON 树形 Schema 编辑器（字段名、类型、示例值、说明），数据模型支持 `$ref` 跨接口复用
- 返回响应支持多个 HTTP 状态码，每个响应独立定义 JSON Schema
- 未保存修改自动进入**本地草稿**，切换页面不丢内容

### 请求调试
- Run Tab 独立运行：响应内容/响应头/请求头/cURL 一键复制
- Query 参数 + Body JSON 同时发送，环境变量 `{{x}}` 运行时自动解析
- 一键填充：从 Schema 示例或 default 值生成 Body JSON（支持 JSONC 注释）
- 运行历史自动保存（最近 10 条），异常也记录，Drawer 查看详情
- 请求超时配置、Cookie 自动管理、二进制响应预览/保存、跳过 TLS 证书校验

### 自动化测试（v1.4 起）
- 拖拽式流程画布：开始/结束/HTTP 请求/条件/循环/等待/并行/变量赋值/断言 9 种节点
- ELK 自动布局、连线增强（贝塞尔/折线、分支标注、循环体/出口标注）、路径高亮
- 流程执行引擎：环境选择、实时日志、节点状态高亮（脉冲/绿/红）、快速失败模式
- PreScript 前置脚本、While/ForEach 循环、条件等待、子流程执行、执行记录持久化
- 流程校验、节点大纲、执行历史面板、任务文件夹分组
- **MCP 服务**：18 个工具，AI Agent 可读取接口上下文并一键创建测试任务；AI Prompt 自动生成

### 环境与变量
- 项目级全局环境切换（开发/生产等多环境），环境配置 UI 优化
- 全局变量、环境变量、密钥与前置 URL 统一维护，支持 `{{varName}}` 模板语法
- 动态变量系统（QuickJS 脚本引擎）：内置变量脚本化 + 参数注入 + 补全提示
- 会话变量、全局 Header / Query / Cookie / Body 参数、个人本地值与团队值优先级覆盖

### 导入导出与分享
- 导入：OpenAPI 3.x / Swagger 2.0 JSON/YAML，静默合并到当前项目
- 导出：OpenAPI 3.0 / Swagger 2.0 规范文档、Markdown / MHTML 文档、cURL
- **局域网文档分享**：只读访客页 + 密码鉴权，生成无密码/带密码链接，编辑修改、实时刷新
- 个人 Token（YAPI 兼容）：配合 [Java 插件](https://github.com/xiaohuiduan/ApiMocktle-java-plugin) 同步项目

### 体验与个性化
- 设计风格系统：CSS 变量驱动、4 种风格（含玻璃拟态）、明暗主题全面跟随
- 界面密度三档：紧凑 / 标准 / 宽松
- 多项目标签页：浏览器式切换、右键菜单、页签保存状态反馈（保存中/失败/未保存）
- 状态栏：当前环境名 / URL + 未保存页签数
- 全局网络代理：SOCKS5 / HTTP(S)、配置持久化、实时生效、测试连接
- 图标体系统一 lucide，内置 885 个图标

## 更新日志

### 1.0 → 1.1 (2026-05)

- 📄 **响应格式化** — 运行界面响应内容自动格式化 JSON
- 💡 **字段提示** — API 文档字段名称与描述添加工具提示
- 🔄 **环境参数系统** — 完善全局/环境参数合并、启用开关、变量输入增强
- ✨ **粒子动效** — 登录页和项目列表页粒子动效背景
- 📎 **文件上传** — 支持 form-data 文件上传
- 🏷️ **版本号管理** — 基于 Git tag 的版本号显示
- 📐 **运行 Tab 布局优化** — 可拖拽分隔面板，修复横向溢出
- 🧹 **UI/UX 优化** — 移除快捷请求/文档编辑中的 Auth 模块，优化项目列表卡片

### 1.1 → 1.2 (2026-05)

- 🌐 **全局网络代理** — 设置页新增「网络代理」标签页，支持 SOCKS5 和 HTTP(S)
- ⚙️ **配置持久化** — 代理配置写入 `app_data_dir/config/app_config.json`，更新不丢失
- 🏷️ **代理指示器** — RunTab/快捷请求/结果页显示代理类型 Tag，悬停显示 host:port
- 🔗 **测试连接** — 支持自定义 URL 测试代理连通性
- 🎨 **图标库扩展** — 图标数量扩展至 885 个，分类合并为 7 类

### 1.2 → 1.3 (2026-05)

- 💬 **结构化错误提示** — HTTP 请求错误按 8 种场景分类，展示中文提示 + 修复建议 + 技术详情 + 一键重试
- 🔒 **跳过证书验证** — HTTPS 请求支持一键跳过 TLS 证书校验
- 🏷️ **多项目标签页** — 浏览器式切换、右键菜单、快速切换下拉、项目卡片统计
- 🕐 **运行历史记录** — 接口/快捷请求自动保存最近 10 条，异常也记录，Drawer 查看详情
- ⌨️ **Ctrl+S 保存** — 所有保存页面支持 Ctrl+S/Cmd+S
- 📐 **布局重构** — 用户菜单移至侧边栏底部，编辑/运行场景区分示例值

### 1.3 → 1.4 (2026-06)

- 🎨 **可视化测试流程编辑器** — 拖拽画布，9 种节点类型，ELK 自动布局，连线/分支标注增强
- 🧠 **MCP 服务（AI Agent 集成）** — 18 个 MCP 工具，`get_flow_context` 获取接口上下文，`create_task_with_flow` 一键创建测试任务
- 🔄 **流程执行引擎** — 环境选择、实时日志、节点状态高亮、快速失败
- ⚡ **执行引擎补全** — PreScript 前置脚本、While/ForEach 循环、条件等待、子流程执行、执行记录持久化
- ✅ **流程校验 / 节点大纲 / 执行历史面板**
- 📂 **测试任务文件夹分组** — 左右分栏布局，任务可在文件夹间移动
- 🔀 **RunTab 数据分离** — 运行时修改不覆盖文档定义，独立存储 + 一键复原三选项
- 🤖 **AI Prompt 生成** — 导入弹窗提供完整 Prompt 模板（含 `$ref` 解析、断言/提取器格式说明）

### 1.4 → 1.5 (2026-06 ~ 08)

- 🎨 **设计风格系统全面升级** — CSS 变量驱动 + 4 种风格全覆盖 + 过渡动画 + 界面密度三档（紧凑/标准/宽松）
- 🔗 **流程图路径高亮** — 悬停预览 + 点击锁定、上下游双色追踪
- 🛡️ **Mock 依赖拦截** — 自动化测试支持依赖 Mock 与单节点调试运行
- 🖥️ **运行 Tab 完整重构** — 参数交互优化、body 类型切换不丢文本、cURL 一键复制、JSONC 行尾注释、历史参数恢复
- 🌍 **环境改为项目级全局切换** — 环境配置 UI 优化（前置 URL 协议选择框、单前置 URL）
- 📥 **导入导出与分享合并单一入口** — 修复 Swagger 2.0 快捷导出、cURL cookie/body 丢失
- 📝 **本地草稿机制** — 未保存修改自动保存，不丢失编辑内容
- 📄 **MHTML 文档导出** — 样式简洁聚焦 API 内容
- ⚡ **快捷请求运行页重构** — 顶层五 tab + Cookie 发送
- 🗂️ **请求体表格排版优化** — 新增必填设置，整列对齐

### 1.5 → 1.6 (2026-08)

- ⏱️ **请求超时配置** — 单接口可配置超时时间
- 🔢 **动态变量** — 支持动态变量与补全提示、说明弹窗
- 🍪 **Cookie 自动管理** — 请求 Cookie 自动保存与回传
- 🖼️ **二进制响应** — 图片等二进制响应预览/保存
- 🔧 **标签栏与快捷键修复** — Ctrl+S capture 监听、标签关闭可见性

### 1.6 → 1.7 (2026-08)

- 🔬 **动态变量系统重构** — 脚本引擎 Rhai → QuickJS，单类型化（script）+ Rust 单点求值 + 管理面板
- 🌐 **局域网文档分享** — 只读访客页 + 密码鉴权 + 分享链接管理（无密码/带密码链接、编辑修改、免手动输入密码、随机 6 位密码）
- 📦 **分享服务打包优化** — resources 打包、monaco 产物瘦身、CI 资产精简
- 🔑 **登录/注册卡片式切换** — 消除整页跳转，登录时长选择常驻禁用
- 🎨 **主题体系全面修复** — 全局 CSS 变量跟随、暗色主题缺省变量补齐、骨架屏/入场动画
- 📊 **状态栏与页签反馈** — 状态栏显示环境名/URL + 未保存页签数，页签保存中 Spin / 失败叹号 / 未保存星号
- 🧾 **请求头完整展示** — 实际发出的完整请求头（含 Host/UA/Content-Length），未发送默认头灰显
- 🧪 **自动化测试体验优化** — 新手引导、并行分支任意数量、工具栏按钮恢复主行、参数表格撑满列宽
- 🤖 **MCP 服务全面优化** — 工具精简、prompt 统一、并行节点汇合出口标签修复
- 🐛 **修复** — form-data/url-encoded body 参数错位、深链路由回退、接口树空状态引导等

## 为什么做这个项目

相比依赖外部服务的 API 管理工具（如 Apifox、Postman），更希望把常用的接口管理能力放到一个可以自行审计、运行和改造的代码库里。结合 Tauri 桌面框架，做到真正的本地优先、离线可用、无数据外泄风险。（例如著名的API工具投毒事件）

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 |
| 前端 | React 18 + React Router v7 + Vite |
| UI | Ant Design v5 + TailwindCSS + Lucide React |
| 编辑器 | Monaco Editor（JSON 输入）+ ByteMD（Markdown） |
| 画布 | @xyflow/react（流程图）+ ELK.js（自动布局）|
| 脚本引擎 | QuickJS（动态变量 / 测试脚本） |
| 后端 | Rust + Axum（YAPI/MCP HTTP 服务） |
| 数据库 | SQLite（rusqlite） |
| 实时协作 | Yjs CRDT（在线文档） |

## 项目结构

```text
src/                   前端源码
  app/                 页面路由
  components/          UI 组件（ApiTab、JsonSchema、项目面板等）
  contexts/            React Context（auth、menu-helpers、global）
  features/
    test-flow/         测试流程编辑器
      components/      画布、工具栏、节点面板、配置抽屉、导入弹窗、运行弹窗
      nodes/           节点组件（BaseNode、ConditionNode、LoopNode 等）
      store/           Zustand store（useFlowStore）
      hooks/           执行引擎（useFlowExecution）、持久化（useFlowPersistence）
      types/           流程类型定义
      contexts/        FlowEditorContext、FlowInstanceContext
  hooks/               全局 hooks（useApiMenu、useTestTask 等）
  utils/               工具函数（Markdown/HTML 导出）

src-tauri/             Rust 后端
  src/
    commands/          Tauri 命令（auth、projects、menu_items、test_tasks、test_flow、environments）
    db/                SQLite 仓储（auth_repo、project_repo、menu_repo、test_repo、flow_repo）
    services/          业务逻辑（导入解析、测试引擎 test_engine）
    http/              YAPI 兼容 HTTP 服务 + MCP 服务（mcp_server）
  Cargo.toml
```

## 快速开始

### 环境要求

- Node.js `>= 20`
- pnpm `>= 9`
- Rust (stable toolchain)

### 安装依赖

```sh
pnpm install
```

### 启动开发环境

```sh
pnpm tauri:dev
```

### 构建

```sh
pnpm tauri:build
```

## 数据库

- 默认位置：`%APPDATA%/com.apimocktle.app/runtime/apimocktle.sqlite`（Windows）
- 启动时自动创建所需表结构
- 表包括：users、sessions、projects、project_members、menu_items、recycle_items、meta、share_links、personal_tokens

## 导入导出说明

- 导入支持 `.json`、`.yaml`、`.yml`，OpenAPI 3.x 和 Swagger 2.0 均可导入
- 导出生成完整的 OpenAPI 3.0 / Swagger 2.0 规范文档（含 paths + definitions/schemas）
- 支持导出 Markdown / MHTML 文档与 cURL 命令
- 导入采用静默合并策略，不会清空已有资源
- 文档分享生成局域网访问链接，只读展示接口文档（可设置访问密码）

## 致谢

1. 本项目的界面与交互参考了 [Codennnn / Apifox-UI](https://github.com/Codennnn/Apifox-UI)。感谢原作者提供高质量的 UI 设计还原与开源分享，这个项目在此基础上继续做了适配、重构和演进。
2. 感觉[qq201128 / Apifox-Local](https://github.com/qq201128/Apifox-Local)在Apifox-UI的基础上增加了很多功能，能够让我在其上面的基础上添加更多的功能。
3. 感谢mimo 100T计划，给我提供的免费2亿credits套餐（虽然我一天就蹬完了🤣）。
4. 感谢伟大的DeepSeek V4 pro，在五一期间降价，让我疯狂蹬，花费却不到100，完成了项目所有内容。


