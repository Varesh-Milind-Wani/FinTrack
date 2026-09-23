import { Send, X, Sparkles, TrendingUp, TrendingDown, Clock, Tag } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Transaction, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  type?: "text" | "suggestion" | "help";
}

interface PendingTransaction {
  type: "profit" | "loss";
  amount: number;
  costIncluded: boolean;
  category?: string;
  note?: string;
}

interface ChatProps {
  onAddTransaction?: (transaction: Transaction) => void;
  user?: UserAccount;
}

const Chat = ({ onAddTransaction, user }: ChatProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your FinTrack AI Assistant. I can help you quickly add transactions, analyze your trades, and provide insights. Try: 'profit 500', 'loss 250', or ask me anything!",
      timestamp: new Date(),
      type: "text",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState<PendingTransaction | null>(null);
  const [costIncluded, setCostIncluded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const parseTransactionInput = (text: string): PendingTransaction | null => {
    const lowerText = text.toLowerCase().trim();
    
    // Enhanced patterns to match various formats
    const profitMatches = [
      /profit\s+([\d.]+)/,
      /gain\s+([\d.]+)/,
      /made\s+([\d.]+)/,
      /win\s+([\d.]+)/,
      /\+\s*([\d.]+)/,
      /up\s+([\d.]+)/,
    ];
    
    const lossMatches = [
      /loss\s+([\d.]+)/,
      /lost\s+([\d.]+)/,
      /lose\s+([\d.]+)/,
      /down\s+([\d.]+)/,
      /-\s*([\d.]+)/,
    ];

    for (const regex of profitMatches) {
      const match = lowerText.match(regex);
      if (match) {
        return {
          type: "profit",
          amount: parseFloat(match[1]),
          costIncluded: false,
        };
      }
    }

    for (const regex of lossMatches) {
      const match = lowerText.match(regex);
      if (match) {
        return {
          type: "loss",
          amount: parseFloat(match[1]),
          costIncluded: false,
        };
      }
    }
    
    return null;
  };

  const getSuggestions = (): string[] => {
    return [
      "profit 500",
      "loss 250",
      "gained 1000",
      "lost 100",
    ];
  };

  const getHelpMessage = (): string => {
    return `Here's what I can help you with:
• Add transactions: "profit 500", "loss 250", "gained 1000"
• Include brokerage: Just confirm when adding
• Quick analysis: "How much profit today?" "Total losses?"
• View suggestions: Type examples above

Supported formats: profit/loss/gain/made/won/lost + amount`;
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
      type: "text",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Check for help command
    if (input.toLowerCase().includes("help")) {
      setTimeout(() => {
        const helpMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: getHelpMessage(),
          timestamp: new Date(),
          type: "help",
        };
        setMessages((prev) => [...prev, helpMessage]);
        setIsLoading(false);
      }, 600);
      return;
    }

    // Try to parse transaction
    const transaction = parseTransactionInput(input);

    if (transaction) {
      setPendingTransaction(transaction);
      setCostIncluded(false);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `✓ Detected a ${transaction.type} of ${formatCurrency(transaction.amount, user?.currency)}. Would you like to add this transaction?`,
        timestamp: new Date(),
        type: "text",
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    } else {
      // Generic response for non-transaction input
      setTimeout(() => {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "I can help you add transactions quickly! Try saying 'profit 500', 'loss 250', or type 'help' for more options.",
          timestamp: new Date(),
          type: "text",
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setIsLoading(false);
      }, 800);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  const handleConfirmTransaction = () => {
    if (!pendingTransaction || !user) return;

    const now = new Date();
    const costAmount = costIncluded ? user.defaultCostAmount : 0;
    const netAmount = pendingTransaction.type === "profit"
      ? Math.max(0, pendingTransaction.amount - costAmount)  // Profit after costs
      : pendingTransaction.amount;  // Loss is just the loss amount

    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      date: now.toISOString(),
      type: pendingTransaction.type,
      amount: netAmount,
      grossAmount: pendingTransaction.amount,
      costAmount: costAmount,
      price: pendingTransaction.amount,
      category: pendingTransaction.category || "Quick Add",
      note: pendingTransaction.note || `Added via Chat Assistant`,
    };

    // Call parent handler if provided
    if (onAddTransaction) {
      onAddTransaction(newTransaction);
    }

    const confirmMessage: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: `✅ Transaction added! ${pendingTransaction.type === "profit" ? "📈" : "📉"} ${pendingTransaction.type.toUpperCase()} of ${formatCurrency(pendingTransaction.amount, user.currency)}${
        costIncluded ? ` (after brokerage: ${formatCurrency(netAmount, user.currency)})` : ""
      }`,
      timestamp: new Date(),
      type: "text",
    };

    setMessages((prev) => [...prev, confirmMessage]);
    setPendingTransaction(null);
    setCostIncluded(false);
  };

  const handleCancelTransaction = () => {
    const cancelMessage: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: "❌ Transaction cancelled. You can try again anytime.",
      timestamp: new Date(),
      type: "text",
    };
    setMessages((prev) => [...prev, cancelMessage]);
    setPendingTransaction(null);
    setCostIncluded(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !pendingTransaction) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ASSISTANT</span>
          <h1>Chat Assistant</h1>
          <p>Smart transaction entry with AI-powered parsing and analysis</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-primary)" }}>
          <Sparkles size={18} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Advanced Mode</span>
        </div>
      </div>

      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              <div className={`chat-bubble ${message.type === "help" ? "help-message" : ""}`}>
                <p>{message.content}</p>
                <span className="chat-time">
                  {message.timestamp.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="chat-message assistant">
              <div className="chat-bubble">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          {pendingTransaction && (
            <div className="chat-message assistant">
              <div className="chat-confirmation">
                <div className="confirmation-header">
                  <h4>Confirm Transaction</h4>
                  <span className={`badge ${pendingTransaction.type}`}>
                    {pendingTransaction.type === "profit" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {pendingTransaction.type.toUpperCase()}
                  </span>
                </div>
                
                <div className="confirmation-details">
                  <div className="detail-row">
                    <span>Amount</span>
                    <strong>{formatCurrency(pendingTransaction.amount, user?.currency)}</strong>
                  </div>
                  <div className="detail-row">
                    <Clock size={14} />
                    <span>Date & Time</span>
                    <strong>{new Date().toLocaleString("en-IN")}</strong>
                  </div>
                </div>

                <div className="confirmation-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={costIncluded}
                      onChange={(e) => setCostIncluded(e.target.checked)}
                    />
                    <span>Include brokerage (default cost: {formatCurrency(user?.defaultCostAmount || 0, user?.currency)})</span>
                  </label>
                </div>

                {costIncluded && user && (
                  <div className="cost-breakdown">
                    <div className="breakdown-row">
                      <span>Gross Amount</span>
                      <span>{formatCurrency(pendingTransaction.amount, user.currency)}</span>
                    </div>
                    <div className="breakdown-row cost">
                      <span>Brokerage</span>
                      <span>{formatCurrency(user.defaultCostAmount, user.currency)}</span>
                    </div>
                    <div className="breakdown-row net">
                      <span>Net Amount</span>
                      <span>{formatCurrency(pendingTransaction.amount - user.defaultCostAmount, user.currency)}</span>
                    </div>
                  </div>
                )}

                <div className="confirmation-actions">
                  <button
                    className="secondary-button"
                    onClick={handleCancelTransaction}
                  >
                    <X size={16} />
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    onClick={handleConfirmTransaction}
                  >
                    <Send size={16} />
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}
          {!pendingTransaction && messages.length === 1 && (
            <div className="chat-message assistant">
              <div className="chat-suggestions">
                <p className="suggestions-label">Quick suggestions:</p>
                <div className="suggestions-grid">
                  {getSuggestions().map((suggestion, idx) => (
                    <button
                      key={idx}
                      className="suggestion-btn"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      <Tag size={14} />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type 'profit 500', 'loss 250', or 'help' for commands..."
              rows={2}
              disabled={!!pendingTransaction}
            />
            <button
              className="chat-send-button"
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading || !!pendingTransaction}
              title="Send message (Shift+Enter for new line)"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
