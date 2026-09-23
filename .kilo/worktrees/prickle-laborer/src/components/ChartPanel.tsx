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
  return (
    <section
      className={`chart-panel ${
        onClick ? "chart-panel-clickable" : ""
      } ${className}`}
      onClick={onClick}
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
        <div className="chart-interaction-hint">
          Mouse wheel: Zoom • Double-click: Reset
        </div>
      </div>
    </section>
  );
};

export default ChartPanel;
