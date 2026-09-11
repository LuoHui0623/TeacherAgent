# frontend

前端工作台（React 19 + Vite + Tailwind v4），工作台式布局，无路由库。

## 目录职责

| 目录 | 职责 |
|---|---|
| `modules/` | UI 层：各功能模块的界面组件（知识地图 / 书架 / 学习区 / 笔记 / 画像） |
| `services/` | 业务层：数据获取、状态管理、API client（`runtime/`） |
| `shared/` | 通用组件与布局（`styles/` 为设计令牌） |
| `constants/` | 通用常量；`messages.ts` 为全中文界面文案（不用 i18n） |
| `mocks/` | 开发用假数据（MSW），仅开发环境 |
| `prototype/` | 原型设计稿，不参与构建 |
| `scripts/` | 辅助脚本 |
| `src/` | 仅入口文件（`main.tsx` / `App.tsx` / `index.css`） |

## 依赖规则

- `modules → services → shared / constants / utils` 单向依赖
- `modules` 之间不互相依赖
- `mocks` 仅开发环境生效；`prototype` 不参与构建

## 设计语言

基于 minimalist-ui：暖色单色画布（`#F7F6F3`）、1px `#EAEAEA` 结构线、8-12px 圆角、无渐变无重阴影、Phosphor 图标、克制动效（仅 transform/opacity）。设计令牌见 `shared/styles/tokens.css`。

## 命令

```bash
npm run dev     # 开发（5173）
npm run build   # 构建
npm run lint    # lint
```
