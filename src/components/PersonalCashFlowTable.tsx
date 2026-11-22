import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Search, Trash2, Wallet, X } from "lucide-react";
import type { Expense, IncomeEntry } from "../types/finance";
import { formatCurrency } from "../utils/money";

type Props = {
  mode: "income" | "expense";
  incomes?: IncomeEntry[];
  expenses?: Expense[];
  currency: string;
  onEditIncome?: (income: IncomeEntry) => void;
  onDeleteIncome?: (id: string) => void;
  onEditExpense?: (expense: Expense) => void;
  onDeleteExpense?: (id: string) => void;
};
const PAGE_SIZE = 12;
const DETAIL_PAGE_SIZE = 10;
const getRecordMonth = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : "undated";
type CashFlowRow = { id: string; name: string; category: string; categories: string[]; date: string; amount: number; note: string; item: IncomeEntry | Expense };


export default function PersonalCashFlowTable({ mode, incomes = [], expenses = [], currency, onEditIncome, onDeleteIncome, onEditExpense, onDeleteExpense }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [detailCategory, setDetailCategory] = useState("all");
  const fmt = (value: number) => formatCurrency(value, currency);
  const rows = useMemo<CashFlowRow[]>(() => mode === "income"
    ? incomes.map((item) => ({ id: item.id, name: item.source, category: item.category, categories: [item.category], date: item.date.slice(0, 10), amount: item.amount, note: item.note, item }))
    : expenses.map((item) => ({ id: item.id, name: item.name, category: item.categories?.length ? item.categories.join(", ") : item.category, categories: item.categories?.length ? item.categories : [item.category], date: item.date.slice(0, 10), amount: item.amount, note: item.note, item })), [mode, incomes, expenses]);
  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows.filter((row) => !query || [row.name, row.category, row.date, row.note, String(row.amount)].join(" ").toLocaleLowerCase().includes(query));
  }, [rows, search]);
  const months = useMemo(() => {
    const monthMap = new Map<string, typeof visibleRows>();
    visibleRows.forEach((row) => {
      const key = getRecordMonth(row.date);
      monthMap.set(key, [...(monthMap.get(key) ?? []), row]);
    });
    return [...monthMap.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [visibleRows]);
  const pageCount = Math.max(1, Math.ceil(months.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pageMonths = months.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const monthRows = selectedMonth ? rows.filter((row) => getRecordMonth(row.date) === selectedMonth) : [];
  const detailCategoryOptions = [...new Set(monthRows.flatMap((row) => row.categories))].sort();
  const filteredMonthRows = detailCategory === "all" ? monthRows : monthRows.filter((row) => row.categories.includes(detailCategory));
  const detailPageCount = Math.max(1, Math.ceil(filteredMonthRows.length / DETAIL_PAGE_SIZE));
  const activeDetailPage = Math.min(detailPage, detailPageCount);
  const visibleMonthRows = filteredMonthRows.slice((activeDetailPage - 1) * DETAIL_PAGE_SIZE, activeDetailPage * DETAIL_PAGE_SIZE);
  function monthLabel(key: string) { return key === "undated" ? "Date not set" : new Date(`${key}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); }
  const canManage = mode === "income" ? Boolean(onEditIncome || onDeleteIncome) : Boolean(onEditExpense || onDeleteExpense);
  const recordCount = mode === "income" ? incomes.length : expenses.length;

  const edit = (item: IncomeEntry | Expense) => mode === "income" ? onEditIncome?.(item as IncomeEntry) : onEditExpense?.(item as Expense);
  const remove = (id: string) => mode === "income" ? onDeleteIncome?.(id) : onDeleteExpense?.(id);

  return <section className="personal-cashflow-card" aria-label={mode === "income" ? "Monthly income records" : "Monthly expense records"}>
    <header className="personal-cashflow-header"><div><span className="eyebrow">{mode === "income" ? "INCOME HISTORY" : "EXPENSE HISTORY"}</span><h2>Monthly {mode} summary</h2><p>Choose a month to open its saved {mode} entries.</p></div><div className="personal-cashflow-count"><Wallet size={17} /><span>{recordCount} records saved</span></div></header>
    <div className="expense-toolbar personal-cashflow-toolbar"><div className="search-box shared-black-search"><Search size={16} className="search-icon" /><input aria-label={`Search ${mode} records`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={`Search ${mode} records`} /></div><span className="expense-summary">{visibleRows.length} entries</span></div>
    <div className="enterprise-table-container"><table className="enterprise-table personal-cashflow-table"><thead><tr><th>MONTH</th><th>RECORDS</th><th>TOTAL {mode.toUpperCase()}</th><th></th></tr></thead><tbody>
      {!pageMonths.length ? <tr><td colSpan={4} className="expense-empty">{recordCount ? `No ${mode} records match your search or category filter.` : `No ${mode} records yet. Add one to see your monthly history.`}</td></tr> : pageMonths.map(([key, entries]) => <tr key={key} className="cashflow-month-row"><td><button type="button" className="cashflow-month-open" onClick={() => { setSelectedMonth(key); setDetailPage(1); setDetailCategory("all"); }}>{monthLabel(key)}<span>View entries</span></button></td><td>{entries.length} {mode === "income" ? "income" : "expense"} {entries.length === 1 ? "record" : "records"}</td><td className={mode === "income" ? "positive" : "negative"} style={{ fontWeight: 800 }}>{fmt(entries.reduce((sum, row) => sum + row.amount, 0))}</td><td><button type="button" className="cashflow-month-view" onClick={() => { setSelectedMonth(key); setDetailPage(1); setDetailCategory("all"); }}>Open month <ChevronRight size={15} /></button></td></tr>)}
    </tbody></table></div>
    {months.length > 0 && <nav className="expense-pagination" aria-label={`${mode} month pages`}><span>Showing {(activePage - 1) * PAGE_SIZE + 1}–{Math.min(activePage * PAGE_SIZE, months.length)} of {months.length} months</span><div><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={activePage === 1}><ChevronLeft size={16} /> Previous</button><strong>Page {activePage} of {pageCount}</strong><button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={activePage === pageCount}>Next <ChevronRight size={16} /></button></div></nav>}
    {selectedMonth && <div className="modal-overlay cashflow-month-overlay" onMouseDown={(event) => event.target === event.currentTarget && setSelectedMonth(null)}><section className="transaction-modal cashflow-month-dialog" role="dialog" aria-modal="true" aria-labelledby={`${mode}-month-dialog-title`}><header className="modal-header"><div><span className="eyebrow">{mode === "income" ? "INCOME DETAILS" : "EXPENSE DETAILS"}</span><h2 id={`${mode}-month-dialog-title`}>{monthLabel(selectedMonth)}</h2></div><button type="button" className="close-button" onClick={() => setSelectedMonth(null)} aria-label="Close month details"><X size={18} /></button></header><div className="cashflow-month-dialog-toolbar"><div className="cashflow-month-dialog-summary"><span>{filteredMonthRows.length} {filteredMonthRows.length === 1 ? "record" : "records"}</span><strong>{mode === "income" ? "Total income" : "Total expenses"}: {fmt(filteredMonthRows.reduce((sum, row) => sum + row.amount, 0))}</strong></div><label htmlFor={`${mode}-dialog-category-filter`}>Filter category<select id={`${mode}-dialog-category-filter`} value={detailCategory} onChange={(event) => { setDetailCategory(event.target.value); setDetailPage(1); }}><option value="all">All categories</option>{detailCategoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><div className="enterprise-table-container"><table className="enterprise-table"><thead><tr><th>{mode === "income" ? "SOURCE" : "EXPENSE"}</th><th>CATEGORY</th><th>DATE</th><th>AMOUNT</th><th>NOTE</th>{canManage && <th>ACTIONS</th>}</tr></thead><tbody>{visibleMonthRows.length ? visibleMonthRows.map((row) => <tr key={row.id}><td style={{ fontWeight: 700 }}>{row.name}</td><td>{row.category}</td><td>{row.date ? new Date(`${row.date}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td><td className={mode === "income" ? "positive" : "negative"} style={{ fontWeight: 800 }}>{mode === "income" ? "+" : "−"}{fmt(row.amount)}</td><td>{row.note || "—"}</td>{canManage && <td><div className="expense-actions"><button type="button" className="action-button" onClick={() => { edit(row.item); setSelectedMonth(null); }} aria-label={`Edit ${row.name}`}><Pencil size={14} /></button><button type="button" className="action-button delete" onClick={() => remove(row.id)} aria-label={`Delete ${row.name}`}><Trash2 size={14} /></button></div></td>}</tr>) : <tr><td colSpan={canManage ? 6 : 5} className="expense-empty">No {mode} records in this category for {monthLabel(selectedMonth)}.</td></tr>}</tbody></table></div>{filteredMonthRows.length > DETAIL_PAGE_SIZE && <nav className="expense-pagination cashflow-dialog-pagination" aria-label={`${monthLabel(selectedMonth)} entries pages`}><span>Showing {(activeDetailPage - 1) * DETAIL_PAGE_SIZE + 1}–{Math.min(activeDetailPage * DETAIL_PAGE_SIZE, filteredMonthRows.length)} of {filteredMonthRows.length} entries</span><div><button type="button" onClick={() => setDetailPage((value) => Math.max(1, value - 1))} disabled={activeDetailPage === 1}><ChevronLeft size={16} /> Previous</button><strong>Page {activeDetailPage} of {detailPageCount}</strong><button type="button" onClick={() => setDetailPage((value) => Math.min(detailPageCount, value + 1))} disabled={activeDetailPage === detailPageCount}>Next <ChevronRight size={16} /></button></div></nav>}</section></div>}
  </section>;
}
