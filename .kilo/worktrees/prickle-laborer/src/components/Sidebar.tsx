import {
  BarChart3,
  CircleDollarSign,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  TrendingDown,
  TrendingUp,
  MessageCircle,
} from "lucide-react";
import type { UserAccount } from "../types/finance";

interface SidebarProps {
  user: UserAccount;
  activePage: "dashboard" | "transactions" | "analytics" | "profitloss" | "withdrawals" | "settings" | "chat";
  onPageChange: (
    page: "dashboard" | "transactions" | "analytics" | "profitloss" | "withdrawals" | "settings" | "chat"
  ) => void;
  onLogout: () => void;
  mobileOpen: boolean;
}

const Sidebar = ({
  user,
  activePage,
  onPageChange,
  onLogout,
  mobileOpen,
}: SidebarProps) => {
  return (
    <aside
      className={`sidebar ${
        mobileOpen ? "sidebar-open" : ""
      }`}
    >
      <div className="brand">
        <div className="brand-logo">
          <CircleDollarSign size={21} />
        </div>

        <span>FinTrack</span>
      </div>

      <div className="sidebar-section-title">
        PERSONAL FINANCE
      </div>

      <nav className="sidebar-nav">
        <button
          className={
            activePage === "dashboard"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("dashboard")}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </button>

        <button
          className={
            activePage === "transactions"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("transactions")}
        >
          <CreditCard size={18} />
          Transactions
        </button>

        <button
          className={
            activePage === "analytics"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("analytics")}
        >
          <BarChart3 size={18} />
          Analytics
        </button>

        <button
          className={
            activePage === "profitloss"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("profitloss")}
        >
          <TrendingUp size={18} />
          P&L
        </button>

        <button
          className={
            activePage === "withdrawals"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("withdrawals")}
        >
          <TrendingDown size={18} />
          Withdrawals
        </button>

        <button
          className={
            activePage === "settings"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("settings")}
        >
          <Settings size={18} />
          Settings
        </button>

        <button
          className={
            activePage === "chat"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("chat")}
        >
          <MessageCircle size={18} />
          Chat Assistant
        </button>
      </nav>

      <div className="sidebar-bottom">
        <div className="profile-card">
          <div className="profile-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>

          <div className="profile-info">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
        </div>

        <button
          className="logout-button"
          onClick={onLogout}
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
