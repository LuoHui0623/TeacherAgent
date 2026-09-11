import { ModulePlaceholder } from '../../shared/ModulePlaceholder';
import { messages } from '../../constants';

export function ProfileModule() {
  return (
    <ModulePlaceholder
      title={messages.nav.profile}
      description="查看并手动修改用户画像：技术栈与当前水平的总结。"
    />
  );
}
