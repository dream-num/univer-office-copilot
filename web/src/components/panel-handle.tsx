type PanelHandleProps = {
  side: 'left' | 'right';
  collapsed: boolean;
  expandLabel: string;
  collapseLabel: string;
  onToggle(): void;
};

export function PanelHandle({
  side,
  collapsed,
  expandLabel,
  collapseLabel,
  onToggle,
}: PanelHandleProps) {
  const label = collapsed ? expandLabel : collapseLabel;
  const pointsRight = side === 'left' ? collapsed : !collapsed;
  return (
    <button
      type="button"
      className={`panel-handle panel-handle-${side}`}
      aria-label={label}
      aria-expanded={!collapsed}
      onClick={onToggle}
    >
      <svg width="12" height="32" viewBox="0 0 12 32" fill="none" aria-hidden="true">
        <path
          className="panel-handle-rest"
          d="M6 5V27"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          className="panel-handle-arrow"
          d={pointsRight ? 'M4 10L8 16L4 22' : 'M8 10L4 16L8 22'}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="panel-handle-tip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}
