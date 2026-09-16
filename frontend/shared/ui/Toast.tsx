import { useToastStore } from './toastStore';

export function ToastViewport() {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="ui-toast-viewport" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div
          key={item.id}
          className={`ui-toast is-${item.variant} ${item.leaving ? 'is-leaving' : ''}`}
          role="status"
          tabIndex={0}
          onClick={() => dismiss(item.id)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            dismiss(item.id);
          }}
        >
          <div className="ui-toast__copy">
            <strong>{item.title}</strong>
            {item.description ? <p>{item.description}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
