import { CheckIcon, PaintBrushIcon, TextAaIcon } from '@phosphor-icons/react';

import {
  usePreferencesStore,
  type ColorScheme,
  type FontFamily,
  type FontSize,
} from '../../services/preferencesStore';
import { SelectButton } from '../../shared/ui';

const colorOptions: { value: ColorScheme; label: string; colors: string[] }[] = [
  { value: 'jade', label: '青绿', colors: ['#0d766e', '#0fb9a6', '#dff2ee'] },
  { value: 'blue', label: '湛蓝', colors: ['#2563eb', '#3b82f6', '#e5efff'] },
  { value: 'violet', label: '紫罗兰', colors: ['#7c3aed', '#9061f9', '#f0eaff'] },
  { value: 'amber', label: '琥珀', colors: ['#b45309', '#d97706', '#fff1da'] },
];

const fontOptions: { value: FontFamily; label: string }[] = [
  { value: 'system', label: '系统默认' },
  { value: 'humanist', label: '人文屏显' },
  { value: 'serif', label: '阅读衬线' },
  { value: 'mono', label: '等宽字体' },
];

const sizeOptions: { value: FontSize; label: string; sample: string }[] = [
  { value: 'small', label: '小', sample: '14' },
  { value: 'medium', label: '标准', sample: '15' },
  { value: 'large', label: '大', sample: '17' },
];

export function PersonalizationPanel() {
  const colorScheme = usePreferencesStore((state) => state.colorScheme);
  const fontFamily = usePreferencesStore((state) => state.fontFamily);
  const fontSize = usePreferencesStore((state) => state.fontSize);
  const setColorScheme = usePreferencesStore((state) => state.setColorScheme);
  const setFontFamily = usePreferencesStore((state) => state.setFontFamily);
  const setFontSize = usePreferencesStore((state) => state.setFontSize);

  return (
    <section className="personalization-page">
      <header className="personalization-header motion-enter">
        <p className="page-kicker">Settings / Appearance</p>
        <h1 className="page-title">个性化美化</h1>
        <p className="page-subtitle">调整工作台色系、展示字体与内容字号。</p>
      </header>

      <div className="personalization-grid">
        <section className="personalization-panel motion-enter motion-delay-1">
          <div className="personalization-panel__heading">
            <PaintBrushIcon size={20} weight="duotone" />
            <div>
              <strong>色系</strong>
              <span>操作色与状态色的全局主题</span>
            </div>
          </div>

          <div className="color-scheme-grid">
            {colorOptions.map((option) => {
              const selected = option.value === colorScheme;
              return (
                <button
                  key={option.value}
                  id={`settings-color-${option.value}`}
                  type="button"
                  className={`color-scheme-option ${selected ? 'is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => setColorScheme(option.value)}
                >
                  <span className="color-scheme-option__swatches" aria-hidden="true">
                    {option.colors.map((color) => (
                      <span key={color} style={{ background: color }} />
                    ))}
                  </span>
                  <span>{option.label}</span>
                  {selected ? <CheckIcon size={14} weight="bold" /> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="personalization-panel motion-enter motion-delay-2">
          <div className="personalization-panel__heading">
            <TextAaIcon size={20} weight="duotone" />
            <div>
              <strong>字体</strong>
              <span>字体族与正文阅读字号</span>
            </div>
          </div>

          <SelectButton
            id="settings-font-family"
            label="展示字体"
            value={fontFamily}
            options={fontOptions}
            onChange={(value) => setFontFamily(value as FontFamily)}
          />

          <div className="font-size-setting">
            <span className="ui-field__label">内容字号</span>
            <div className="font-size-options">
              {sizeOptions.map((option) => (
                <button
                  key={option.value}
                  id={`settings-font-size-${option.value}`}
                  type="button"
                  className={`font-size-option ${
                    option.value === fontSize ? 'is-selected' : ''
                  }`}
                  aria-pressed={option.value === fontSize}
                  onClick={() => setFontSize(option.value)}
                >
                  <span>{option.label}</span>
                  <small>{option.sample}px</small>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="personalization-preview motion-enter motion-delay-3">
        <span>预览</span>
        <h3>结构化教材阅读</h3>
        <p>
          函数不是公式的别名，而是一种稳定的对应关系。调整设置后，阅读内容会立即使用新的色系、字体和字号。
        </p>
      </section>
    </section>
  );
}
