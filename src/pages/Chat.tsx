import { Send, X, Sparkles, TrendingUp, TrendingDown, Clock, Bot, ShieldCheck, BarChart3, Target } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Transaction, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { calculateCurrentBalance } from "../utils/balance";

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
  onAddTransaction?: (transaction: Transaction) => boolean | void;
  user?: UserAccount;
}

const Chat = ({ onAddTransaction, user }: ChatProps) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const firstName = user?.name.trim().split(/\s+/)[0];
    return [{
      id: crypto.randomUUID(),
      role: "assistant",
      content: `${greeting}${firstName ? `, ${firstName}` : ""}. I'm your private FinTrack copilot. I can review your saved journal, explain concepts, help you think through a plan, or add a trade after you confirm it. What would be useful right now?`,
      timestamp: now,
      type: "text",
    }];
  });
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
    const amount = "([\\d,]+(?:\\.\\d{1,2})?)";
    // Enhanced patterns to match various formats
    const profitMatches = [
      new RegExp(`profit\\s+(?:[₹$€£]\\s*)?${amount}`),
      new RegExp(`gain(?:ed)?\\s+(?:[₹$€£]\\s*)?${amount}`),
      new RegExp(`made\\s+(?:[₹$€£]\\s*)?${amount}`),
      new RegExp(`won\\s+(?:[₹$€£]\\s*)?${amount}`),
      new RegExp(`\\+\\s*(?:[₹$€£]\\s*)?${amount}`),
      new RegExp(`up\\s+(?:[₹$€£]\\s*)?${amount}`),
    ];
    const lossMatches = [
      new RegExp(`loss\\s+(?:[₹$€£]\\s*)?${amount}`),
      new RegExp(`lost\\s+(?:[₹$€£]\\s*)?${amount}`),
      new RegExp(`lose\\s+(?:[₹$€£]\\s*)?${amount}`),
      new RegExp(`down\\s+(?:[₹$€£]\\s*)?${amount}`),
      new RegExp(`-\\s*(?:[₹$€£]\\s*)?${amount}`),
    ];

    for (const regex of profitMatches) {
      const match = lowerText.match(regex);
      if (match) {
        return {
          type: "profit",
          amount: Number(match[1].replace(/,/g, "")),
          costIncluded: false,
        };
      }
    }
    for (const regex of lossMatches) {
      const match = lowerText.match(regex);
      if (match) {
        return {
          type: "loss",
          amount: Number(match[1].replace(/,/g, "")),
          costIncluded: false,
        };
      }
    }
    return null;
  };

  const suggestions = [
    { label: "Review my performance", icon: BarChart3 },
    { label: "What was my best trade?", icon: TrendingUp },
    { label: "Explain profit factor", icon: Sparkles },
    { label: "Tell me a joke", icon: Bot },
  ];
  const getSuggestions = () => suggestions;

  const getHelpMessage = (): string => {
    return `Here's what I can do, using your saved FinTrack data:\n\n• Journal: "profit ₹1,250", "lost 300" - I’ll show a confirmation before saving.\n• Performance: ask for today, this week, this month, or all-time results.\n• Trade review: ask for your best/worst trade, win rate, profit factor, or average result.\n• Learn: ask what expectancy, drawdown, or risk/reward means.\n• Everyday chat: greetings, brainstorming, motivation, and general explanations.\n\nI don’t have live market, news, or web access in this chat. I can only calculate from records saved in your account.`;
  };

  const getStatsReply = (question: string) => {
    if (!user) return "Sign in to let me analyze your saved trade journal.";
    const now = new Date();
    const query = question.toLowerCase();
    let start: Date | null = null;
    let periodLabel = "all time";
    if (/today|this day/.test(query)) {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodLabel = "today";
    } else if (/week|weekly/.test(query)) {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      periodLabel = "this week";
    } else if (/month|monthly/.test(query)) {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      periodLabel = "this month";
    }
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const trades = user.transactions.filter((transaction) => {
      if ((transaction.type !== "profit" && transaction.type !== "loss") || !Number.isFinite(transaction.amount)) return false;
      const match = transaction.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(transaction.date);
      return !Number.isNaN(date.getTime()) && date < end && (!start || date >= start);
    });
    const wins = trades.filter((trade) => trade.type === "profit");
    const losses = trades.filter((trade) => trade.type === "loss");
    const profitTotal = wins.reduce((sum, trade) => sum + trade.amount, 0);
    const lossTotal = losses.reduce((sum, trade) => sum + trade.amount, 0);
    const net = profitTotal - lossTotal;
    const winRate = trades.length ? Math.round((wins.length / trades.length) * 100) : 0;
    const averageResult = trades.length ? net / trades.length : 0;
    const best = wins.reduce<Transaction | null>((record, trade) => !record || trade.amount > record.amount ? trade : record, null);
    const worst = losses.reduce<Transaction | null>((record, trade) => !record || trade.amount > record.amount ? trade : record, null);

    if (/balance|available money|account value/.test(query)) {
      return `Your current recorded balance is ${formatCurrency(calculateCurrentBalance(user), user.currency)}. This reflects the balance saved in FinTrack; it is not a live bank or broker balance.`;
    }
    if (/total losses|gross loss|how much (?:did i )?lose|how much loss|losses/.test(query)) return `Your recorded loss total ${periodLabel} is ${formatCurrency(lossTotal, user.currency)} across ${losses.length} losing ${losses.length === 1 ? "trade" : "trades"}. This reflects amounts saved in your journal.`;
    if (/total profit|gross profit|how much (?:did i )?make|how much profit|profits/.test(query)) return `Your recorded profit total ${periodLabel} is ${formatCurrency(profitTotal, user.currency)} across ${wins.length} winning ${wins.length === 1 ? "trade" : "trades"}. This reflects amounts saved in your journal.`;
    if (/best|biggest win|top trade|largest profit/.test(query) && /trade|win|profit|result/.test(query)) {
      return best ? `Your largest recorded winning trade ${periodLabel} was ${formatCurrency(best.amount, user.currency)}${best.category ? ` in ${best.category}` : ""}${best.date ? ` on ${new Date(best.date).toLocaleDateString("en-IN")}` : ""}.\nUse it as a review prompt: what did you execute well, and can you repeat the process without increasing risk?` : `No winning trades are recorded for ${periodLabel}. A blank result is useful information; keep logging consistently and follow your plan.`;
    }
    if (/worst|biggest loss|largest loss/.test(query)) {
      return worst ? `Your largest recorded loss ${periodLabel} was ${formatCurrency(worst.amount, user.currency)}${worst.category ? ` in ${worst.category}` : ""}${worst.date ? ` on ${new Date(worst.date).toLocaleDateString("en-IN")}` : ""}.\nReview the setup and whether your planned risk was respected. Learn from the record; don’t try to win it back in one trade.` : `No losing trades are recorded for ${periodLabel}. Keep your normal risk controls in place.`;
    }
    if (/win rate/.test(query)) return trades.length ? `Your recorded win rate ${periodLabel} is ${winRate}% (${wins.length} wins from ${trades.length} trades).\nWin rate alone does not show whether a strategy is profitable; compare average wins, average losses, fees, and risk.` : `There are no recorded trades for ${periodLabel}, so I can’t calculate a win rate yet.`;
    if (/profit factor/.test(query)) return lossTotal > 0 ? `Your recorded profit factor ${periodLabel} is ${(profitTotal / lossTotal).toFixed(2)} (saved profits ${formatCurrency(profitTotal, user.currency)} ÷ saved losses ${formatCurrency(lossTotal, user.currency)}).\nIt’s a backward-looking ratio; read it with drawdown and sample size.` : trades.length ? `You have ${formatCurrency(profitTotal, user.currency)} in recorded profits and no recorded losses ${periodLabel}, so profit factor is not meaningful yet.\nTreat a small or incomplete sample cautiously.` : `There are no recorded trades for ${periodLabel} to calculate profit factor.`;
    if (/expectancy|average result|average per trade/.test(query)) return trades.length ? `Your average net result ${periodLabel} is ${formatCurrency(averageResult, user.currency)} per recorded trade across ${trades.length} trades.\nThis is a historical average, not a forecast; fees and missing entries can change it.` : `There are no recorded trades for ${periodLabel} to estimate an average result.`;
    if (!trades.length) return `I don’t see any saved trades ${periodLabel}. Add a few entries and I can summarize the results here.`;
    return `Your ${periodLabel} journal: ${trades.length} trades, ${wins.length} wins, ${losses.length} losses, ${winRate}% win rate.\nNet ${formatCurrency(net, user.currency)} (${formatCurrency(profitTotal, user.currency)} recorded profit - ${formatCurrency(lossTotal, user.currency)} recorded loss); average ${formatCurrency(averageResult, user.currency)} per trade.\n${net > 0 ? "Good progress: protect your process and keep risk consistent." : net < 0 ? "Use the numbers as a review prompt; avoid chasing and stick to your planned risk." : "Stay focused on quality setups and consistent record-keeping."}`;
  };

  const getConversationReply = (question: string) => {
    const query = question.toLowerCase().trim();
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(query)) {
      const firstName = user?.name.trim().split(/\s+/)[0];
      return `Hey${firstName ? `, ${firstName}` : ""}! What’s on your mind? We can look at your journal, talk through a trading concept, or chat about something completely different.`;
    }
    if (/\b(thanks|thank you|appreciate it)\b/.test(query)) return "You’re welcome. Keep asking questions, and take things one clear step at a time.";
    if (/\bhow are you\b|\bhow's it going\b/.test(query)) return "Doing well and ready to help. How are you doing today - want to talk through something, learn a concept, or review your journal?";
    if (/^(help|commands)\??$|\b(who are you|what can you do|how can you help)\b/.test(query)) return getHelpMessage();
    if (/\b(joke|make me laugh)\b/.test(query)) return "Why did the spreadsheet go to therapy? Too many unresolved cells.\nWant another one, or shall we get back to your journal?";
    if (/\b(motivat|encourag|bad day|rough day|feeling down|lost today|loss today)\b/.test(query)) return "A rough session is an event, not your identity. Step away, review one decision when you’re calm, and let the next setup earn your attention. You don’t have to trade to make progress.";
    if (/\b(brainstorm|ideas for|help me think|think through)\b/.test(query)) return "Absolutely. Tell me the goal, who it is for, and any limits you are working within. I’ll help you shape options, weigh trade-offs, and turn the best one into a next step.";
    if (/\b(plan my day|plan my week|make a plan|set a goal|organize my)\b/.test(query)) return "Let’s make it practical:\n1. Name the one outcome that would make the day useful.\n2. Choose the smallest next action and give it a time.\n3. Leave a little room for breaks and surprises.\nShare your goal and constraints and I can tailor the plan.";
    if (/\b(quote|give me a boost|inspire me)\b/.test(query)) return "A good process is built in ordinary moments: prepare, act with intention, and review honestly. You only need to make the next decision well.";
    if (/\b(weather|latest news|breaking news|live price|current price|market right now|today's market)\b/.test(query)) return "I can’t access live weather, news, or market prices from this app. If you paste the information you’re looking at, I can help explain it; I can also analyze the trades you’ve saved here.";
    if (/\b(profit factor|expectancy|drawdown|risk.reward|risk reward|win rate)\b/.test(query)) {
      if (/what|explain|mean|define/.test(query)) {
        if (/profit factor/.test(query)) return "Profit factor compares total recorded winning amounts with total recorded losing amounts. For example, 1.5 means 1.5 units of gains for each unit of losses in that sample. It’s backward-looking and says nothing by itself about future outcomes.";
        if (/expectancy/.test(query)) return "Expectancy is the average result per recorded trade over a sample: total net result divided by trade count. It can hide large swings, so read it alongside drawdown, costs, and sample size.";
        if (/drawdown/.test(query)) return "Drawdown measures how far results fell from a previous peak to a later low. It describes the depth of a decline in your recorded history; it does not predict the next one.";
        if (/risk.reward|risk reward/.test(query)) return "Risk/reward compares the amount you plan to risk with the potential gain in a setup. It only helps when the risk and target are defined before entry and followed consistently.";
        return "Win rate is the share of recorded trades that ended positive. It needs context: average win, average loss, charges, and risk per trade all matter too.";
      }
    }
    if (/\b(explain|what is|what's|define)\b/.test(query)) {
      if (/compound interest/.test(query)) return "Compound interest means returns can earn returns over time. The effect depends on the amount, rate, time, and how often growth is applied; actual investment returns are never guaranteed.";
      if (/inflation/.test(query)) return "Inflation is a broad rise in prices over time, which means the same amount of money may buy less. Its effect differs across households because spending patterns differ.";
      if (/diversification/.test(query)) return "Diversification means spreading exposure across different assets or sources of risk. It can reduce dependence on one holding, but it cannot remove market risk or guarantee a profit.";
      if (/budget|budgeting/.test(query)) return "A budget is a plan for where money will go. A simple start is to list regular income, fixed commitments, flexible spending, savings goals, and a small buffer, then compare the plan with actual spending.";
      if (/habit/.test(query)) return "A habit is a behavior repeated in a consistent context until it takes less deliberate effort. Make the first step small, attach it to a routine you already have, and track consistency rather than perfection.";
    }
    if (/\b(balance|performance|summary|stats|how am i doing|how did i do|my results|trading results|today|this week|this month|all.time|best trade|biggest win|worst trade|biggest loss|win rate|profit factor|expectancy|average result|how much (?:did i )?(?:make|lose)|total profits|total losses)\b/.test(query)) return getStatsReply(query);
    if (/\b(what should i do|should i trade|should i buy|should i sell|what stock|which stock|entry price|target price)\b/.test(query)) return "I can’t tell you what to buy or sell or provide a live entry/target. I can help you build a decision checklist: define the setup, planned loss, invalidation point, and what would make you stay out before acting.";
    return `I’m here for it. I can talk beyond trading, but I don’t use an online generative-AI service, so I may need a little context for open-ended topics. Tell me what you’re working through, or try “${suggestions[0].label},” “explain drawdown,” or ask for a quick joke.`;
  };

  const handleSendMessage = async (messageText = input) => {
    const question = messageText.trim();
    if (!question || isLoading || pendingTransaction) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      timestamp: new Date(),
      type: "text",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const transaction = parseTransactionInput(question);

    if (transaction) {
      setPendingTransaction(transaction);
      setCostIncluded(false);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `✓ Detected a ${transaction.type} of ${formatCurrency(transaction.amount, user?.currency)}. Would you like to add this transaction?`,
        timestamp: new Date(),
        type: "text",
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    } else {
      const helpRequest = /^(help|commands|what can you do)\??$/i.test(question.trim());
      window.setTimeout(() => {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: getConversationReply(question),
          timestamp: new Date(),
          type: helpRequest ? "help" : "text",
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setIsLoading(false);
      }, 280);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    void handleSendMessage(suggestion);
  };

  const getScheduledCost = () => {
    if (!user) return 0;
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return [...(user.defaultCostSchedules ?? [])]
      .filter((schedule) => schedule.startDate <= nowKey)
      .sort((left, right) => right.startDate.localeCompare(left.startDate))[0]?.amount
      ?? user.defaultCostAmount;
  };

  const getPendingNetAmount = () => {
    if (!pendingTransaction) return 0;
    const cost = costIncluded ? getScheduledCost() : 0;
    const grossSigned = pendingTransaction.type === "profit" ? pendingTransaction.amount : -pendingTransaction.amount;
    return grossSigned - cost;
  };

  const handleConfirmTransaction = () => {
    if (!pendingTransaction || !user) return;

    const now = new Date();
    const scheduledCost = getScheduledCost();
    const costAmount = costIncluded ? scheduledCost : 0;
    const grossSigned = pendingTransaction.type === "profit" ? pendingTransaction.amount : -pendingTransaction.amount;
    const netSigned = grossSigned - costAmount;

    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      date: now.toISOString(),
      type: netSigned < 0 ? "loss" : "profit",
      amount: Math.abs(netSigned),
      grossAmount: pendingTransaction.amount,
      costAmount: costAmount,
      price: pendingTransaction.amount,
      category: pendingTransaction.category || "Quick Add",
      note: pendingTransaction.note || `Added via Chat Assistant`,
    };

    // Call parent handler if provided
    if (!onAddTransaction || onAddTransaction(newTransaction) === false) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "I couldn't save that entry. Check the app message for the reason, then try again with an allowed weekday or unlock the relevant month.",
        timestamp: new Date(),
        type: "text",
      }]);
      setPendingTransaction(null);
      setCostIncluded(false);
      return;
    }

    const confirmMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `✅ Transaction added! ${pendingTransaction.type === "profit" ? "📈" : "📉"} ${pendingTransaction.type.toUpperCase()} of ${formatCurrency(pendingTransaction.amount, user.currency)}${
        costIncluded ? ` (after brokerage: ${formatCurrency(getPendingNetAmount(), user.currency)})` : ""
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
      id: crypto.randomUUID(),
      role: "assistant",
      content: "❌ Transaction cancelled. You can try again anytime.",
      timestamp: new Date(),
      type: "text",
    };
    setMessages((prev) => [...prev, cancelMessage]);
    setPendingTransaction(null);
    setCostIncluded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !pendingTransaction) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="page-content chat-assistant-page">
      <div className="page-heading chat-assistant-heading">
        <div>
          <span className="eyebrow">FINTRACK COPILOT</span>
          <h1>Chat Assistant</h1>
          <p>Your trade journal, quick capture, clear explanations, and everyday conversation.</p>
        </div>
        <div className="chat-assistant-status">
          <span className="chat-assistant-status-dot" />
          <span>Journal-aware</span>
          <span className="chat-assistant-status-divider">·</span>
          <span>No live market feed</span>
        </div>
      </div>

      <div className="chat-capability-strip" aria-label="Assistant capabilities">
        <span><BarChart3 size={15} /><b>Journal insights</b><small>{user?.transactions.length ?? 0} saved trades</small></span>
        <span><Target size={15} /><b>Trade discipline</b><small>Process-first guidance</small></span>
        <span><ShieldCheck size={15} /><b>Confirm before saving</b><small>You stay in control</small></span>
      </div>

      <div className="chat-container chat-premium-container">
        <div className="chat-messages">
          {messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              <div className={`chat-bubble ${message.type === "help" ? "help-message" : ""}`}>
                {message.role === "assistant" && <span className="chat-bubble-author"><Bot size={14} /> FinTrack Copilot</span>}
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
                    <span>Include brokerage (scheduled cost: {formatCurrency(getScheduledCost(), user?.currency)})</span>
                  </label>
                </div>

                {costIncluded && user && (
                  <div className="cost-breakdown">
                    <div className="breakdown-row">
                      <span>{pendingTransaction.type === "profit" ? "Gross profit" : "Gross loss"}</span>
                      <span>{formatCurrency(pendingTransaction.amount, user.currency)}</span>
                    </div>
                    <div className="breakdown-row cost">
                      <span>Brokerage / cost</span>
                      <span>{formatCurrency(getScheduledCost(), user.currency)}</span>
                    </div>
                    <div className="breakdown-row net">
                      <span>{getPendingNetAmount() < 0 ? "Net loss" : "Net profit"}</span>
                      <span>{formatCurrency(getPendingNetAmount(), user.currency)}</span>
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
                <div className="chat-welcome-prompt">
                  <strong>Pick a starting point</strong>
                  <span>Ask about your saved results or switch to any topic.</span>
                </div>
                <div className="suggestions-grid">
                  {getSuggestions().map(({ label, icon: SuggestionIcon }) => (
                    <button
                      key={label}
                      className="suggestion-btn"
                      onClick={() => handleSuggestionClick(label)}
                    >
                      <SuggestionIcon size={15} />
                      {label}
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
              onKeyDown={handleKeyDown}
              placeholder="Ask about your journal, a concept, or anything on your mind…"
              aria-label="Message the FinTrack Copilot"
              rows={1}
              disabled={!!pendingTransaction}
            />
            <button
              className="chat-send-button"
              onClick={() => { void handleSendMessage(); }}
              disabled={!input.trim() || isLoading || !!pendingTransaction}
              title="Send message (Shift+Enter for new line)"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="chat-input-hint">Enter to send <span>·</span> Shift + Enter for a new line <span>·</span> journal answers use your saved records</p>
        </div>
      </div>
    </div>
  );
};

export default Chat;
