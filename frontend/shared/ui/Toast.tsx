import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';

import { domId } from '../ids';
import { useToastStore } from './toastStore';

const toastIcons = {
  success: CheckCircleIcon,
  error: WarningCircleIcon,
  info: InfoIcon,
};

export function ToastViewport() {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="ui-toast-viewport" aria-live="polite" aria-atomic="false">
      {items.map((item) => {
        const Icon = toastIcons[item.variant];
        return (
          <div key={item.id} className={`ui-toast is-${item.variant}`} role="status">
            <span className="ui-toast__icon">
              <Icon size={18} weight="fill" />
            </span>
            <div className="ui-toast__copy">
              <strong>{item.title}</strong>
              {item.description ? <p>{item.description}</p> : null}
            </div>
            <button
              type="button"
              id={domId('toast', 'dismiss', item.id)}
              className="ui-toast__close"
              onClick={() => dismiss(item.id)}
              aria-label="关闭通知"
              title="关闭"
            >
              <XIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
