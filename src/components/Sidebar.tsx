import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  TrendingDown,
  TrendingUp,
  MessageCircle,
  PiggyBank,
  FileBarChart,
} from "lucide-react";
import type { UserAccount } from "../types/finance";

interface SidebarProps {
  user: UserAccount;
  activePage: "dashboard" | "transactions" | "analytics" | "profitloss" | "reports" | "withdrawals" | "settings" | "chat" | "investment" | "expenses" | "profile";
  onPageChange: (
    page: "dashboard" | "transactions" | "analytics" | "profitloss" | "reports" | "withdrawals" | "settings" | "chat" | "investment" | "expenses" | "profile"
  ) => void;
  onLogout: () => void;
  mobileOpen: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const Sidebar = ({
  user,
  activePage,
  onPageChange,
  onLogout,
  mobileOpen,
  collapsed,
  onToggleCollapse,
}: SidebarProps) => {
  return (
    <aside
      className={`sidebar ${mobileOpen ? "sidebar-open" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}
    >
      <div className="brand">
        <div className="brand-logo">
          <CircleDollarSign size={21} />
        </div>

        <span>FinTrack</span>
        <button
          type="button"
          className="sidebar-collapse-button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        <button
          className={
            activePage === "dashboard"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("dashboard")}
          aria-label="Dashboard"
          title={collapsed ? "Dashboard" : undefined}
        >
          <LayoutDashboard size={18} />
          <span className="nav-label">Dashboard</span>
        </button>

        <button
          className={
            activePage === "transactions"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("transactions")}
          aria-label="Transactions"
          title={collapsed ? "Transactions" : undefined}
        >
          <CreditCard size={18} />
          <span className="nav-label">Transactions</span>
        </button>

        <button
          className={
            activePage === "analytics"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("analytics")}
          aria-label="Analytics"
          title={collapsed ? "Analytics" : undefined}
        >
          <BarChart3 size={18} />
          <span className="nav-label">Analytics</span>
        </button>

        <button
          className={
            activePage === "profitloss"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("profitloss")}
          aria-label="Profit and Loss"
          title={collapsed ? "P&L" : undefined}
        >
          <TrendingUp size={18} />
          <span className="nav-label">P&amp;L</span>
        </button>

        <button
          className={
            activePage === "withdrawals"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("withdrawals")}
          aria-label="Withdrawals"
          title={collapsed ? "Withdrawals" : undefined}
        >
          <TrendingDown size={18} />
          <span className="nav-label">Withdrawals</span>
        </button>

        <button
          className={
            activePage === "reports"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("reports")}
          aria-label="Reports"
          title={collapsed ? "Reports" : undefined}
        >
          <FileBarChart size={18} />
          <span className="nav-label">Reports</span>
        </button>

        <button
          className={
            activePage === "investment"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("investment")}
          aria-label="Investment"
          title={collapsed ? "Investment" : undefined}
        >
          <PiggyBank size={18} />
          <span className="nav-label">Investment</span>
        </button>

        <button
          className={
            activePage === "settings"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("settings")}
          aria-label="Settings"
          title={collapsed ? "Settings" : undefined}
        >
          <Settings size={18} />
          <span className="nav-label">Settings</span>
        </button>

        <button
          className={
            activePage === "chat"
              ? "nav-button active"
              : "nav-button"
          }
          onClick={() => onPageChange("chat")}
          aria-label="Chat Assistant"
          title={collapsed ? "Chat Assistant" : undefined}
        >
          <MessageCircle size={18} />
          <span className="nav-label">Chat Assistant</span>
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className={`profile-card ${activePage === "profile" ? "active" : ""}`}
          onClick={() => onPageChange("profile")}
          aria-label={`Open profile for ${user.name}`}
          aria-current={activePage === "profile" ? "page" : undefined}
          title={collapsed ? `Profile: ${user.name}` : undefined}
        >
          <div className="profile-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>

          <div className="profile-info">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
        </button>

        <button
          className="logout-button"
          onClick={onLogout}
          aria-label="Logout"
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut size={16} />
          <span className="nav-label">Logout</span>
        </button>
      </div>

    </aside>
  );
};

export default Sidebar;
