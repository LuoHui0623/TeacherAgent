# frontend

前端工作台（React 19 + Vite + Tailwind v4），工作台式布局，无路由库。

## 目录职责

| 目录 | 职责 |
|---|---|
| `modules/` | UI 层：组件与私有 CSS 同目录；`modules/mocks/` 存共享样例数据 |
| `services/` | 业务层：数据获取、状态管理、API client（`runtime/`） |
| `shared/` | Shell、通用组件与布局；`ui/` 提供 Button / Field / Modal / Drawer / Toast，`styles/` 提供设计令牌与统一样式 |
| `constants/` | 通用常量；`messages.ts` 为全中文界面文案（不用 i18n） |
| `prototype/` | 原型设计稿，不参与构建 |
| `scripts/` | 辅助脚本 |
| `src/` | 仅入口文件（`main.tsx` / `App.tsx` / `index.css`） |

## 依赖规则

- `modules → services → shared / constants / utils` 单向依赖
- `modules` 之间不互相依赖
- 模块私有样式与模块同目录并由模块入口导入，`src/index.css` 只保留全局基础与共享控件
- 前端样例数据统一放在 `modules/mocks/`；`prototype` 不参与构建
- Shell 固定为 TopBar + SideNav + Content；所有按钮必须提供 `domain-purpose` 形式的稳定 `id`

## 设计语言

基于冷中性画布、青绿色操作色与琥珀状态色，使用 1px 结构线、8px 以内圆角、Phosphor 图标和统一 motion 曲线。设计令牌见 `shared/styles/tokens.css`，组件规范见 `shared/styles/system.css`。

## 命令

```bash
npm run dev     # 开发（5173）
npm run build   # 构建
npm run lint    # lint
```
