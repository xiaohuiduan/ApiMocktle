> [!CAUTION]
> 该项目仍处于开发阶段。
>
> - 功能仍在持续补齐，数据结构和交互细节可能继续调整。
> - 本地数据默认写入 `runtime/apimocktle.sqlite`，调试前请注意备份。
> - 导入接口文档会静默合并到当前项目资源，不会清空已有内容。

# ApiMocktle

**Mock**（模拟，鹦鹉学舌）+ **Turtle**（龟）→ **Mocktle**。突出 API 模拟能力，壳（shell）象征数据结构稳定。

一个基于 React Router + Vite + TypeScript + Ant Design + SQLite 的本地优先 API 管理项目。它提供注册登录、项目协作、接口目录、文档与模型编辑、环境管理、请求调试、接口导入导出等能力，目标是把常用的接口管理工作流放到一个可审计、可运行、可自行改造的项目里。

![项目界面展示](https://i.imgur.com/8UmNM9c.png)

## 为什么做这个项目

这个项目的直接起点，是对 Apifox 投毒漏洞问题的关注。相比依赖不可控的客户端环境，我更希望把常用的接口管理能力放到一个可以自行审查、运行和改造的代码库里，在保留熟悉工作流的同时，把数据和运行环境的主动权拿回到自己手上。

## 当前能力

- 用户注册、登录、退出登录，基于 Cookie Session 持久化登录状态。
- 项目列表页支持创建、重命名、删除项目。
- 项目成员支持 `owner`、`editor`、`viewer` 三种角色。
- 支持邀请链接、邀请接受与角色控制。
- 接口管理页支持树形目录、拖拽排序、重命名、复制、移动、删除与回收站恢复。
- 资源类型覆盖接口、Markdown 文档、数据模型、快捷请求。
- 接口编辑支持路径、参数、请求体、认证方式、响应定义、示例数据等。
- 环境管理支持前置 URL、全局变量、全局 Header / Query / Cookie / Body 参数。
- 支持在项目内直接运行接口请求并查看返回结果。
- 支持导入 OpenAPI 3.x、Postman Collection v2/v2.1。
- 支持导出 OpenAPI JSON / YAML。
- 接口目录支持从 cURL 导入单条请求。
- 新增项目级共享文件区：成员可上传、下载、删除共享文件。
- 新增项目级在线文档：支持新建、编辑、保存、导出 Markdown。
- 在线文档支持基于 CRDT 的协同同步（Yjs 状态合并，轮询拉取最新状态）。
- 内置主题编辑器，可调整界面主题配置。

## 技术栈

- 前端与路由：React 18、React Router v7、Vite
- UI：Ant Design、TailwindCSS、Lucide React、Emotion
- 编辑能力：Monaco Editor、ByteMD
- 服务端能力：React Router Route Handlers
- 数据存储：Node 内置 `node:sqlite`
- 语言与工具：TypeScript、ESLint、Stylelint

## 项目结构

```text
src/
  app/            页面路由与 API 路由
  components/     界面组件、编辑器、设置面板
  server/         业务逻辑、导入导出、请求执行、SQLite 仓储
  contexts/       全局状态与编辑辅助上下文
  data/           初始展示数据与默认内容
  content/        项目介绍等共享文案
  styles/         全局样式
runtime/
  apimocktle.sqlite   启动后自动生成的本地数据库
```

## 快速开始

### 环境要求

- Node.js `>= 20`
- pnpm `>= 9`

### 安装依赖

```sh
pnpm install
```

### 启动开发环境

```sh
pnpm dev
```

首次使用建议按这个顺序体验：

1. 打开注册页创建账号。
2. 登录后进入项目列表，新建一个项目。
3. 在项目设置中配置环境或导入 OpenAPI / Postman 文档。
4. 回到接口管理页编辑接口、文档和模型，并直接运行请求。

### 构建与启动

```sh
pnpm build
pnpm start
```

### 代码检查

```sh
pnpm lint
```

## 数据与运行方式

- 数据库文件默认位于 `runtime/apimocktle.sqlite`。
- 项目启动时会自动创建 `runtime/` 目录和所需表结构。
- 当前数据表覆盖用户、会话、项目、项目成员、邀请、菜单项、回收站和项目级元数据。
- 这是一个本地即可跑起来的完整应用，不是纯前端 mock 页面。

## 导入导出说明

- 导入接口文档时，当前项目下的接口、模型、请求目录会静默合并到现有资源，不会清空已有菜单或回收站。
- 导入仅支持 `.json`、`.yaml`、`.yml`。
- OpenAPI 仅支持 `3.x`。
- Postman 仅支持 Collection `v2` / `v2.1`。
- Swagger `2.0` 当前不支持直接导入。
- OpenAPI 导出需要项目具备 `editor` 或以上权限。

## 当前限制

- Binary Body 已建模，但请求运行暂不支持直接执行。
- 文档导入当前为静默合并策略，不提供显式冲突预览。
- 权限与协作能力已具备基础闭环，但仍有继续细化的空间。
- 共享文件未设置业务大小上限，但仍受机器磁盘容量与文件系统限制。
- 在线文档协同当前为增量推送 + 定时拉取模型，不是 WebSocket 持久连接。
- 当前 README 只描述仓库内已实现能力，不承诺未落地功能。

## 致谢

本项目的界面与交互参考了 [Codennnn / Apifox-UI](https://github.com/Codennnn/Apifox-UI)。感谢原作者提供高质量的 UI 设计还原与开源分享，这个项目在此基础上继续做了适配、重构和演进。
