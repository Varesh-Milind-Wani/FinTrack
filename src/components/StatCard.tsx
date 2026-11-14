import {
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  positive?: boolean;
  icon: React.ReactNode;
  formatValue?: (value: number) => string;
  colorVariant?: "green" | "red" | "blue" | "amber" | "purple";
  valueCaption?: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  footerAction?: React.ReactNode;
  headerAction?: React.ReactNode;
  onClick?: () => void;
}

const StatCard = ({
  title,
  value,
  subtitle,
  positive = true,
  icon,
  formatValue,
  colorVariant = "blue",
  valueCaption,
  secondaryLabel,
  secondaryValue,
  footerAction,
  headerAction,
  onClick,
}: StatCardProps) => {
  const getIconColor = () => {
    switch (colorVariant) {
      case "green": return "#10b981";
      case "red": return "#ef5350";
      case "amber": return "#f59e0b";
      case "purple": return "#a78bfa";
      default: return "#5b7cff";
    }
  };

  const getIconBgColor = () => {
    switch (colorVariant) {
      case "green": return "rgba(16, 185, 129, 0.12)";
      case "red": return "rgba(239, 83, 80, 0.12)";
      case "amber": return "rgba(245, 158, 11, 0.12)";
      case "purple": return "rgba(167, 139, 250, 0.12)";
      default: return "rgba(91, 124, 255, 0.12)";
    }
  };

  return (
    <div
      style={{
        background: "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-secondary) 100%)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--spacing-xl)",
        transition: "border-color 180ms ease, background 180ms ease, transform 180ms ease, box-shadow 180ms ease",
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if ((event.target as HTMLElement).closest("button, input, label, select, textarea, a")) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-focus)";
        (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
        (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-secondary) 100%)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--spacing-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, minWidth: 0 }}>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              color: "var(--text-quaternary)",
            }}
          >
            {title}
          </span>
        </div>
        {headerAction ?? (
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-md)",
              backgroundColor: getIconBgColor(),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: getIconColor(),
              fontSize: "18px",
            }}
          >
            {icon}
          </div>
        )}
      </div>

      {secondaryLabel && secondaryValue !== undefined ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginBottom: "var(--spacing-md)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ marginBottom: 5, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>{valueCaption ?? title}</div>
            <div
              style={{ fontSize: "clamp(22px, 2.2vw, 30px)", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1.15, overflowWrap: "anywhere" }}
            >
              {formatValue ? formatValue(value) : Math.round(value).toString()}
            </div>
          </div>
          <div style={{ minWidth: 0, paddingLeft: 14, borderLeft: "1px solid var(--border-subtle)" }}>
            <div style={{ marginBottom: 5, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>{secondaryLabel}</div>
            <div style={{ fontSize: "clamp(22px, 2.2vw, 30px)", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1.15, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>
              {secondaryValue}
            </div>
          </div>
        </div>
      ) : (
        <>
          {valueCaption && (
            <div style={{ marginBottom: 4, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>
              {valueCaption}
            </div>
          )}
          <div
            style={{
              fontSize: "32px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "var(--spacing-md)",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {formatValue ? formatValue(value) : Math.round(value).toString()}
          </div>
        </>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, fontSize: 12, lineHeight: 1.4, color: positive ? "var(--accent-success)" : "var(--accent-danger)", fontWeight: 500 }}>
          {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {subtitle}
        </div>
        {footerAction}
      </div>
    </div>
  );
};

export default StatCard;
