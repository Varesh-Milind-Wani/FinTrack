import React from "react";

interface PremiumCardProps {
  children: React.ReactNode;
  className?: string;
  gradient?: "blue" | "green" | "red" | "amber" | "purple";
  interactive?: boolean;
  onClick?: () => void;
  glow?: boolean;
}

const PremiumCard = ({
  children,
  className = "",
  gradient = "blue",
  interactive = true,
  onClick,
  glow = false,
}: PremiumCardProps) => {
  const getGradientClass = () => {
    switch (gradient) {
      case "green":
        return "bg-gradient-to-br from-green-500/10 to-emerald-500/5";
      case "red":
        return "bg-gradient-to-br from-red-500/10 to-pink-500/5";
      case "amber":
        return "bg-gradient-to-br from-amber-500/10 to-orange-500/5";
      case "purple":
        return "bg-gradient-to-br from-purple-500/10 to-indigo-500/5";
      default:
        return "bg-gradient-to-br from-blue-500/10 to-cyan-500/5";
    }
  };

  const getBorderClass = () => {
    switch (gradient) {
      case "green":
        return "border-green-500/20 hover:border-green-500/40";
      case "red":
        return "border-red-500/20 hover:border-red-500/40";
      case "amber":
        return "border-amber-500/20 hover:border-amber-500/40";
      case "purple":
        return "border-purple-500/20 hover:border-purple-500/40";
      default:
        return "border-blue-500/20 hover:border-blue-500/40";
    }
  };

  const glowClass = glow
    ? "shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40"
    : "";

  return (
    <div
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl backdrop-blur-2xl
        ${getGradientClass()}
        border ${getBorderClass()}
        ${glowClass}
        ${interactive ? "cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl" : ""}
        ${className}
      `}
      style={{
        background:
          gradient === "blue"
            ? "linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0.6))"
            : gradient === "green"
            ? "linear-gradient(135deg, rgba(6, 78, 59, 0.8), rgba(6, 78, 59, 0.6))"
            : gradient === "red"
            ? "linear-gradient(135deg, rgba(127, 29, 29, 0.8), rgba(127, 29, 29, 0.6))"
            : gradient === "amber"
            ? "linear-gradient(135deg, rgba(120, 53, 15, 0.8), rgba(120, 53, 15, 0.6))"
            : "linear-gradient(135deg, rgba(76, 29, 149, 0.8), rgba(76, 29, 149, 0.6))",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Animated gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            gradient === "blue"
              ? "radial-gradient(circle at 30% 30%, rgba(79, 143, 255, 0.15), transparent 60%)"
              : gradient === "green"
              ? "radial-gradient(circle at 30% 30%, rgba(0, 229, 160, 0.15), transparent 60%)"
              : gradient === "red"
              ? "radial-gradient(circle at 30% 30%, rgba(255, 77, 106, 0.15), transparent 60%)"
              : gradient === "amber"
              ? "radial-gradient(circle at 30% 30%, rgba(245, 166, 35, 0.15), transparent 60%)"
              : "radial-gradient(circle at 30% 30%, rgba(167, 139, 250, 0.15), transparent 60%)",
          opacity: interactive ? 0 : 0.5,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
        }}
        className={interactive ? "hover:opacity-100" : ""}
      />

      {/* Top border accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background:
            gradient === "blue"
              ? "linear-gradient(90deg, rgba(79, 143, 255, 0.5), transparent)"
              : gradient === "green"
              ? "linear-gradient(90deg, rgba(0, 229, 160, 0.5), transparent)"
              : gradient === "red"
              ? "linear-gradient(90deg, rgba(255, 77, 106, 0.5), transparent)"
              : gradient === "amber"
              ? "linear-gradient(90deg, rgba(245, 166, 35, 0.5), transparent)"
              : "linear-gradient(90deg, rgba(167, 139, 250, 0.5), transparent)",
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 10 }}>{children}</div>
    </div>
  );
};

export default PremiumCard;
