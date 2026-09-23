import { useEffect, useState } from "react";
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
}

const StatCard = ({
  title,
  value,
  subtitle,
  positive = true,
  icon,
  formatValue,
  colorVariant = "blue",
}: StatCardProps) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 1400;
    const startTime = performance.now();
    const startValue = 0;
    const delta = value - startValue;

    let animationFrame = 0;

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(2, -12 * progress);
      setDisplayValue(startValue + delta * eased);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [value]);

  const renderedValue = formatValue
    ? formatValue(displayValue)
    : Math.round(displayValue).toString();

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
        transition: "all 0.3s ease",
        cursor: "default",
        position: "relative",
        overflow: "hidden",
        backdropFilter: "blur(1px)",
      }}
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
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "var(--spacing-lg)",
        }}
      >
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
      </div>

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
        {renderedValue}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "12px",
          color: positive ? "var(--accent-success)" : "var(--accent-danger)",
          fontWeight: 500,
        }}
      >
        {positive ? (
          <ArrowUpRight size={14} />
        ) : (
          <ArrowDownRight size={14} />
        )}
        {subtitle}
      </div>
    </div>
  );
};

export default StatCard;
