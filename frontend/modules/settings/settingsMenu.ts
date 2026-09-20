import { PaletteIcon, SlidersHorizontalIcon, UserCircleIcon } from '@phosphor-icons/react';

export type SettingsPanel = 'model-config' | 'user-profile' | 'personalization';

export const settingsMenuItems: {
  key: SettingsPanel;
  label: string;
  description: string;
  icon: typeof SlidersHorizontalIcon;
}[] = [
  {
    key: 'model-config',
    label: '模型配置',
    description: '角色模型与温度',
    icon: SlidersHorizontalIcon,
  },
  {
    key: 'user-profile',
    label: '用户画像',
    description: '当前最新画像',
    icon: UserCircleIcon,
  },
  {
    key: 'personalization',
    label: '个性化美化',
    description: '色系、字体与字号',
    icon: PaletteIcon,
  },
];
