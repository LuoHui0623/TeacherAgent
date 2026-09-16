/* 界面文案（全中文，不引入 i18n） */
export const messages = {
  app: {
    title: 'TeacherAgent',
    subtitle: 'AI 教材学习工作台',
  },
  nav: {
    knowledgeMap: '知识地图',
    bookshelf: '教材书架',
    learningZone: '学习区',
    contentPipeline: '教材生产线',
    notes: '笔记区',
    profile: '用户画像',
    settings: '设置',
  },
  tutor: {
    title: '教师 Agent',
    placeholder: '向教师提问…',
    open: '展开对话',
    close: '收起对话',
  },
  common: {
    loading: '加载中…',
    empty: '暂无内容',
    error: '出错了，请重试',
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    edit: '编辑',
  },
} as const;
