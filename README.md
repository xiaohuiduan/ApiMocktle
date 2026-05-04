# ApiMocktle

**Mock**（模拟，类似鹦鹉学舌，突出 API 模拟能力）+ **Turtle**（龟，象征数据结构稳定）→ **Mocktle**。一个基于 **Tauri v2 + React + Rust + SQLite** 的本地优先 API 管理桌面应用。

当然上面的名字是先射箭画靶，AI给我取得，真实原因是因为我养了鹦鹉🦜和乌龟🐢，然后Deepseek给我取了这个名字

它把注册登录、项目管理、接口目录、文档与数据模型编辑、环境变量、请求调试、Swagger/OpenAPI 导入导出等能力整合到一个可离线运行的桌面应用里，数据完全掌握在用户本地。

## 为什么做这个项目

相比依赖外部服务的 API 管理工具（如 Apifox、Postman），更希望把常用的接口管理能力放到一个可以自行审计、运行和改造的代码库里。结合 Tauri 桌面框架，做到真正的本地优先、离线可用、无数据外泄风险。（例如著名的API工具投毒事件）

## 软件部分功能截图
1. 项目管理列表
![项目管理](./assets/project-list.png)

2. 接口管理

![接口文档](./assets/url-doc.png)

3. 接口运行
![接口运行](./assets/url-run.png)

4. 项目设置
![项目设置](./assets/settting.png)

5. 同步设置以及案例
![同步设置以及案例](./assets/sync.png)
## 核心能力

### 项目管理
- 用户注册、登录、记住密码 + 记住登录状态（可选 1/3/7/30 天/永久）
- 创建、重命名、删除项目，支持项目图标
- 成员管理：搜索用户直接加入项目，支持 owner/editor/viewer 三种角色
- 修改密码

### 接口管理
- 树形目录，支持拖拽排序、重命名、复制、移动、删除、回收站恢复
- 资源类型：API 接口 / Markdown 文档 / 数据模型 / 快捷请求
- 接口编辑：路径、Query/Path/Header/Cookie 参数、Body（JSON/XML/form-data/url-encoded/raw/binary）
- Body JSON 支持树形 Schema 编辑器（字段名、类型、示例值、说明）
- 返回响应支持多个 HTTP 状态码，每个响应独立定义 JSON Schema
- 数据模型支持 `$ref` 引用，跨接口复用 Schema 定义

### 环境管理
- 前置 URL、环境变量（支持 `{{varName}}` 模板语法，运行时自动替换）
- 全局 Header / Query / Cookie / Body 参数
- 个人本地值与团队值的优先级覆盖

### 请求调试
- Run Tab 独立运行接口，查看响应内容/响应头/cURL 命令
- 支持 Query 参数 + Body JSON 同时发送
- 环境变量 `{{x}}` 在运行时自动解析
- 一键填充：从 Schema 示例或 default 值自动生成 Body JSON

### 导入导出
- 导入：OpenAPI 3.x / Swagger 2.0 JSON/YAML，静默合并到当前项目
- 导出：完整 OpenAPI 3.0 / Swagger 2.0 规范文档（含 paths + definitions/schemas）
- cURL 导入单条请求
- 接口分享：导出 Markdown 文档

### 个人 Token（YAPI 兼容）
- 用户创建个人 Token，用于[Java插件](https://github.com/xiaohuiduan/ApiMocktle-java-plugin)同步
- `/api/project/list` 返回用户有权限的项目列表
- 插件可选择目标项目进行同步

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 |
| 前端 | React 18 + React Router v7 + Vite |
| UI | Ant Design v5 + TailwindCSS + Lucide React |
| 编辑器 | Monaco Editor（JSON 输入）+ ByteMD（Markdown） |
| 后端 | Rust + Axum（YAPI HTTP 服务） |
| 数据库 | SQLite（rusqlite） |
| 实时协作 | Yjs CRDT（在线文档） |

## 项目结构

```text
src/                   前端源码
  app/                 页面路由
  components/          UI 组件（ApiTab、JsonSchema、项目面板等）
  contexts/            React Context（auth、menu-helpers、global）
  utils/               工具函数（Markdown/HTML 导出）

src-tauri/             Rust 后端
  src/
    commands/          Tauri 命令（auth、projects、menu_items、environments、imports、exports、request_runner）
    db/                SQLite 仓储（auth_repo、project_repo、menu_repo、personal_token_repo 等）
    services/          业务逻辑（导入解析、密码加密、YApi 转换）
    http/              YAPI 兼容 HTTP 服务
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

- 导入支持 `.json`、`.yaml`、`.yml`
- OpenAPI 3.x 和 Swagger 2.0 均可导入
- 导出生成完整的 OpenAPI 3.0 / Swagger 2.0 规范文档
- 导入采用静默合并策略，不会清空已有资源

## 致谢

1. 本项目的界面与交互参考了 [Codennnn / Apifox-UI](https://github.com/Codennnn/Apifox-UI)。感谢原作者提供高质量的 UI 设计还原与开源分享，这个项目在此基础上继续做了适配、重构和演进。
2. 感觉[qq201128 / Apifox-Local](https://github.com/qq201128/Apifox-Local)在Apifox-UI的基础上增加了很多功能，能够让我在其上面的基础上添加更多的功能。
3. 感谢mimo 100T计划，给我提供的免费2亿credits套餐（虽然我一天就蹬完了🤣）。
4. 感谢伟大的DeepSeek V4 pro，在五一期间降价，让我疯狂蹬，花费却不到100，完成了项目所有内容。
