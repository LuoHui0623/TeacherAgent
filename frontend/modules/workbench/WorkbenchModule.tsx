import { messages } from '../../constants';

import './WorkbenchModule.css';

export function WorkbenchModule() {
  return (
    <section className="workbench-page">
      <header className="card workbench-header motion-enter">
        <div>
          <p className="page-kicker">Workspace</p>
          <h1 className="page-title">{messages.nav.workbench}</h1>
          <p className="page-subtitle">
            汇总当前学习目标、教材进度与可用入口的工作区。
          </p>
        </div>
        <span className="workbench-header__status">页面占位</span>
      </header>

      <div className="workbench-grid">
        <article className="card workbench-card">
          <span className="workbench-card__label">当前学习</span>
          <strong>尚未选择学习会话</strong>
          <p>学习会话与有效学习时间将在后续任务中接入。</p>
          <span className="workbench-card__badge">暂未启用计时</span>
        </article>

        <article className="card workbench-card">
          <span className="workbench-card__label">学习目标</span>
          <strong>从学习区继续</strong>
          <p>工作台先提供统一入口，具体学习操作仍在学习区完成。</p>
          <span className="workbench-card__badge">入口占位</span>
        </article>

        <article className="card workbench-card">
          <span className="workbench-card__label">最近产物</span>
          <strong>教材生产线</strong>
          <p>课程设计、教材版本与调试信息将在对应模块中查看。</p>
          <span className="workbench-card__badge">数据待接入</span>
        </article>
      </div>

      <section className="card workbench-scope">
        <span className="workbench-card__label">本阶段范围</span>
        <h2>只建立入口，不记录学习时长</h2>
        <p>
          当前工作台不启动计时、不创建学习会话、不生成小时 / 天 / 月 / 年聚合，
          也不会向用户画像或课程大纲注入有效学习时间。
        </p>
      </section>
    </section>
  );
}
