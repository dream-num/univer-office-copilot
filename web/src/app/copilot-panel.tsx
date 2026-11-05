import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PanelHandle } from '../components/panel-handle.tsx';

const DEFAULT_WIDTH = 336;
const MIN_WIDTH = 300;
const MAX_WIDTH = 640;
const WIDTH_KEY = 'univer-copilot:panel-width';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function savedWidth() {
  try {
    const value = localStorage.getItem(WIDTH_KEY);
    const width = value === null ? DEFAULT_WIDTH : Number(value);
    return Number.isFinite(width) ? clamp(width, MIN_WIDTH, MAX_WIDTH) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

export function CopilotPanel({
  hidden,
  closed,
  onToggle,
  children,
}: {
  hidden: boolean;
  closed: boolean;
  onToggle(): void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const separator = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; width: number; preference: number } | null>(
    null,
  );
  const [preferredWidth, setPreferredWidth] = useState(savedWidth);
  const [bounds, setBounds] = useState({ min: MIN_WIDTH, max: MAX_WIDTH });
  const [dragging, setDragging] = useState(false);
  const width = clamp(preferredWidth, bounds.min, bounds.max);
  const widthRef = useRef(preferredWidth);

  useLayoutEffect(() => {
    const layout = panel.current!.parentElement!;
    const workspace = layout.querySelector<HTMLElement>('.workspace-sidebar');
    const measure = () => {
      const available = layout.getBoundingClientRect().width;
      const overlay = window.matchMedia('(max-width: 760px)').matches;
      const navigation =
        workspace && getComputedStyle(workspace).position !== 'absolute'
          ? workspace.getBoundingClientRect().width
          : 0;
      // Reserve the editor's working area, or the mobile navigation/handle gap.
      const max = overlay
        ? Math.max(0, Math.min(MAX_WIDTH, available - 80))
        : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, available - navigation - 480));
      const min = Math.min(MIN_WIDTH, max);
      setBounds((old) => (old.min === min && old.max === max ? old : { min, max }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    if (workspace) observer.observe(workspace);
    measure();
    return () => observer.disconnect();
  }, []);

  function update(value: number) {
    widthRef.current = value;
    setPreferredWidth(value);
  }
  function save(value: number) {
    update(value);
    try {
      localStorage.setItem(WIDTH_KEY, String(value));
    } catch {
      /* Panel preferences are optional when storage is unavailable. */
    }
  }
  function finish(cancel = false) {
    const started = drag.current;
    if (!started) return;
    drag.current = null;
    setDragging(false);
    if (cancel) update(started.preference);
    else save(widthRef.current);
    if (separator.current?.hasPointerCapture(started.pointerId))
      separator.current.releasePointerCapture(started.pointerId);
  }

  return (
    <div
      ref={panel}
      hidden={hidden}
      className={`copilot-container ${closed ? 'panel-closed' : ''}`}
      style={{ width: closed ? undefined : width, display: hidden ? 'none' : undefined }}
      data-resizing={dragging || undefined}
    >
      <PanelHandle
        side="right"
        collapsed={closed}
        expandLabel="Open Copilot"
        collapseLabel="Close Copilot"
        onToggle={onToggle}
      />
      {!closed && (
        <div
          ref={separator}
          className="copilot-resizer"
          role="separator"
          tabIndex={0}
          aria-label="Resize Copilot panel"
          aria-orientation="vertical"
          aria-controls="copilot-panel"
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          aria-valuenow={width}
          aria-valuetext={`${width} pixels wide`}
          title="Drag to resize · Double-click to reset"
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              width,
              preference: preferredWidth,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const started = drag.current;
            if (started?.pointerId !== event.pointerId) return;
            update(
              Math.round(clamp(started.width + started.x - event.clientX, bounds.min, bounds.max)),
            );
          }}
          onPointerUp={() => finish()}
          onPointerCancel={() => finish(true)}
          onLostPointerCapture={() => finish()}
          onDoubleClick={() => save(clamp(DEFAULT_WIDTH, bounds.min, bounds.max))}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && drag.current) {
              event.preventDefault();
              finish(true);
              return;
            }
            const step = event.shiftKey ? 40 : 20;
            const next = {
              ArrowLeft: width + step,
              ArrowRight: width - step,
              Home: bounds.min,
              End: bounds.max,
              Enter: DEFAULT_WIDTH,
            }[event.key];
            if (next !== undefined) {
              event.preventDefault();
              save(clamp(next, bounds.min, bounds.max));
            }
          }}
        />
      )}
      <div id="copilot-panel" className="copilot-content" hidden={closed}>
        {children}
      </div>
    </div>
  );
}
