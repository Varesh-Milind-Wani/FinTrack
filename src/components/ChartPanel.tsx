import { useRef } from "react";

interface ChartPanelProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  onClick?: () => void;
}

const ChartPanel = ({
  title,
  subtitle,
  children,
  className = "",
  action,
  onClick,
}: ChartPanelProps) => {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedPointerRef = useRef(false);

  return (
    <section
      className={`chart-panel ${
        onClick ? "chart-panel-clickable" : ""
      } ${className}`}
      onPointerDown={(event) => {
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
        movedPointerRef.current = false;
      }}
      onPointerMove={(event) => {
        const start = pointerStartRef.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
          movedPointerRef.current = true;
        }
      }}
      onPointerUp={() => {
        pointerStartRef.current = null;
      }}
      onClick={() => {
        if (movedPointerRef.current) {
          movedPointerRef.current = false;
          return;
        }
        onClick?.();
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${title} chart. Open full screen.` : undefined}
      onKeyDown={(event) => {
        if (!onClick) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="chart-panel-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>

        {action}
      </div>

      <div className="chart-container">
        {children}
      </div>
    </section>
  );
};

export default ChartPanel;
