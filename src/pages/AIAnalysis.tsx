import { FileText, ImagePlus, Trash2, ShieldCheck, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Investment, Transaction, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { extractTradeFields } from "../utils/tradeOcr";
import { detectOrderRows, getOrderReviewIssue, matchDetectedOrders } from "../utils/tradeOrders";

interface Props {
  user: UserAccount;
  onSave: (transaction: Transaction) => boolean | void;
  onSaveReviewed: (transactions: Transaction[], investments: Investment[]) => boolean;
}
type Attachment = { id: string; file: File; url: string };
type TradeDraftFields = {
  include: boolean; instrument: string; strike: string; optionType: "" | "CE" | "PE";
  expiry: string; date: string; entryPrice: string; exitPrice: string; quantity: string;
  chargesMode: "configured" | "manual"; brokerage: string; otherCharges: string;
};
type PaddleEngine = {
  predict: (input: File | HTMLCanvasElement) => Promise<Array<{ items: Array<{ text: string; score: number; poly: Array<[number, number]> }> }>>;
  dispose: () => Promise<void>;
};
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const isPdf = (file: File) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
const isSupportedDocument = (file: File) => isPdf(file) || /^(image\/(png|jpeg|webp))$/.test(file.type);
const makeOcrCanvas = async (file: File) => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(1, Math.min(2, 3200 / Math.max(bitmap.width, bitmap.height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bitmap.width * scale); canvas.height = Math.ceil(bitmap.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) { bitmap.close(); throw new Error("Could not prepare the screenshot for OCR."); }
  context.filter = "grayscale(1) contrast(1.35)";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
};
const getPaddleLayoutText = (items: Array<{ text: string; score: number; poly: Array<[number, number]> }>) => {
  const lines = items.filter((item) => item.text.trim() && item.poly.length > 0).map((item) => {
    const xs = item.poly.map(([x]) => x), ys = item.poly.map(([, y]) => y);
    return { text: item.text.trim(), x: Math.min(...xs), y: ys.reduce((sum, value) => sum + value, 0) / (ys.length || 1), height: Math.max(...ys) - Math.min(...ys), score: item.score };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Array<{ y: number; height: number; cells: typeof lines }> = [];
  for (const line of lines) {
    const tolerance = Math.max(7, Math.min(24, line.height * 0.7));
    const row = rows.find((candidate) => Math.abs(candidate.y - line.y) <= Math.max(tolerance, candidate.height * 0.55));
    if (row) { row.cells.push(line); row.y = row.cells.reduce((sum, cell) => sum + cell.y, 0) / row.cells.length; row.height = Math.max(row.height, line.height); }
    else rows.push({ y: line.y, height: line.height, cells: [line] });
  }
  return rows.sort((a, b) => a.y - b.y).map((row) => row.cells.sort((a, b) => a.x - b.x).map((line) => line.text).join(" ")).join("\n");
};
const getConfiguredCost = (date: string, user: UserAccount) => {
  const schedule = [...(user.defaultCostSchedules ?? [])]
    .filter((item) => item.startDate <= date)
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
  return { amount: schedule?.amount ?? user.defaultCostAmount ?? 0, name: schedule?.name ?? "Default cost" };
};
const getTradeMissingFields = (fields: TradeDraftFields) => {
  const missing: string[] = [];
  if (!fields.instrument.trim()) missing.push("underlying");
  if (!(Number(fields.strike) > 0)) missing.push("strike");
  if (!fields.optionType) missing.push("CE/PE");
  if (!fields.expiry) missing.push("expiry date");
  if (!fields.date) missing.push("trade date");
  if (!(Number(fields.entryPrice) > 0)) missing.push("entry price");
  if (!(Number(fields.exitPrice) > 0)) missing.push("exit price");
  if (!Number.isInteger(Number(fields.quantity)) || Number(fields.quantity) <= 0) missing.push("filled quantity");
  if (fields.chargesMode === "manual" && (fields.brokerage.trim() === "" || fields.otherCharges.trim() === "" || !Number.isFinite(Number(fields.brokerage)) || Number(fields.brokerage) < 0 || !Number.isFinite(Number(fields.otherCharges)) || Number(fields.otherCharges) < 0)) missing.push("valid brokerage and other charges (enter 0 if none)");
  return missing;
};

const AIAnalysis = ({ user, onSave, onSaveReviewed }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<Attachment[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [instrument, setInstrument] = useState("");
  const [strike, setStrike] = useState("");
  const [optionType, setOptionType] = useState<"" | "CE" | "PE">("");
  const [expiry, setExpiry] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [charges, setCharges] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [processing, setProcessing] = useState(false);
  const [reviewFlag, setReviewFlag] = useState<"" | "review" | "low">("");
  const [orders, setOrders] = useState<ReturnType<typeof detectOrderRows>>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tradeOverrides, setTradeOverrides] = useState<Record<string, Partial<TradeDraftFields>>>({});
  const matching = useMemo(() => matchDetectedOrders(orders), [orders]);
  const reviewTrades = useMemo(() => matching.matched.map((trade) => {
    const entryOrder = orders.find((order) => order.id === trade.entryRowId);
    const exitOrder = orders.find((order) => order.id === trade.exitRowId);
    const override = tradeOverrides[trade.id] ?? {};
    const fields: TradeDraftFields = {
      include: override.include ?? !trade.needsIdentityConfirmation,
      instrument: override.instrument ?? trade.instrument,
      strike: override.strike ?? trade.strike,
      optionType: override.optionType ?? trade.optionType,
      expiry: override.expiry ?? trade.expiry,
      date: override.date ?? trade.date,
      entryPrice: override.entryPrice ?? entryOrder?.price ?? (trade.entryPrice ? String(trade.entryPrice) : ""),
      exitPrice: override.exitPrice ?? exitOrder?.price ?? (trade.exitPrice ? String(trade.exitPrice) : ""),
      quantity: override.quantity ?? String(trade.quantity),
      chargesMode: override.chargesMode ?? "configured",
      brokerage: override.brokerage ?? "",
      otherCharges: override.otherCharges ?? "",
    };
    const quantity = Number(fields.quantity), entryPrice = Number(fields.entryPrice), exitPrice = Number(fields.exitPrice);
    const configuredCost = getConfiguredCost(fields.date, user);
    const feeValuesReady = fields.chargesMode === "configured"
      ? Number.isFinite(configuredCost.amount) && configuredCost.amount >= 0
      : fields.brokerage.trim() !== "" && fields.otherCharges.trim() !== "" && Number.isFinite(Number(fields.brokerage)) && Number(fields.brokerage) >= 0 && Number.isFinite(Number(fields.otherCharges)) && Number(fields.otherCharges) >= 0;
    const charges = fields.chargesMode === "configured" ? configuredCost.amount : Number(fields.brokerage) + Number(fields.otherCharges);
    const missingFields = getTradeMissingFields(fields);
    const ready = missingFields.length === 0 && feeValuesReady;
    const gross = (trade.direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice) * quantity;
    return { trade, fields, ready, missingFields, feeValuesReady, gross, charges, configuredCost, net: gross - charges };
  }), [matching.matched, orders, tradeOverrides, user.defaultCostAmount, user.defaultCostSchedules]);
  const readyTrades = reviewTrades.filter((item) => item.fields.include && item.ready);
  const pendingTrades = reviewTrades.filter((item) => item.fields.include && !item.ready);
  const identityReviewTrades = reviewTrades.filter((item) => item.trade.needsIdentityConfirmation && !item.fields.include);
  const pendingFieldNames = [...new Set(pendingTrades.flatMap((item) => item.missingFields))];

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => filesRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);
  const gross = useMemo(() => {
    const a = Number(entry), b = Number(exit), q = Number(quantity);
    if (!(a > 0 && b > 0 && q > 0)) return null;
    return (side === "long" ? b - a : a - b) * q;
  }, [entry, exit, quantity, side]);
  const manualConfiguredCost = getConfiguredCost(date, user);

  const applyExtraction = (text: string) => {
    setOcrText((previous) => [...new Set([previous, text].filter(Boolean))].join("\n\n"));
    const orderRows = detectOrderRows(text);
    if (orderRows.length) {
      const importedIds = new Set([
        ...(user.transactions ?? []).flatMap((transaction) => transaction.sourceOrderIds ?? []),
        ...(user.investments ?? []).flatMap((investment) => investment.sourceOrderId ? [investment.sourceOrderId] : []),
      ]);
      const freshRows = orderRows.filter((order) => !order.orderId || !importedIds.has(order.orderId));
      if (freshRows.length < orderRows.length) setMessage(`${orderRows.length - freshRows.length} order row${orderRows.length - freshRows.length === 1 ? " was" : "s were"} already imported and skipped by order ID.`);
      setOrders((current) => {
        const knownOrderIds = new Set(current.flatMap((order) => order.orderId ? [order.orderId] : []));
        return [...current, ...freshRows.filter((order) => !order.orderId || !knownOrderIds.has(order.orderId))];
      });
      setReviewOpen(true);
    }
    const fields = extractTradeFields(text);
    if (fields.instrument) setInstrument(fields.instrument);
    if (fields.strikePrice) setStrike(String(fields.strikePrice));
    if (fields.optionType) setOptionType(fields.optionType);
    if (fields.expiryDate) setExpiry(fields.expiryDate);
    if (fields.tradeDate) setDate(fields.tradeDate);
    if (fields.entryPrice) setEntry(String(fields.entryPrice));
    if (fields.exitPrice) setExit(String(fields.exitPrice));
    if (fields.quantity) setQuantity(String(fields.quantity));
    setReviewFlag(fields.confidence);
  };

  const updateOrder = (id: string, field: string, value: string | boolean) => {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, [field]: value } : order));
  };

  const updateTrade = (id: string, field: keyof TradeDraftFields, value: string | boolean) => {
    setTradeOverrides((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
    const trade = matching.matched.find((item) => item.id === id);
    if (!trade || typeof value !== "string") return;
    if (field === "entryPrice") updateOrder(trade.entryRowId, "price", value);
    else if (field === "exitPrice") updateOrder(trade.exitRowId, "price", value);
    else if (["instrument", "strike", "optionType", "expiry"].includes(field)) {
      const orderField = field === "expiry" ? "expiry" : field;
      updateOrder(trade.entryRowId, orderField, value);
      updateOrder(trade.exitRowId, orderField, value);
    }
  };

  const confirmReviewedOrders = () => {
    const transactions: Transaction[] = readyTrades.map(({ trade, fields, gross, charges, net }) => {
      const grossSigned = gross;
      const fee = charges;
      const netSigned = net;
      const type = netSigned >= 0 ? "profit" : "loss";
      return {
        id: crypto.randomUUID(), date: new Date(`${fields.date}T12:00:00`).toISOString(), type,
        amount: Math.abs(netSigned), grossAmount: Math.abs(grossSigned), costAmount: fee,
        ...(fields.chargesMode === "manual" ? { brokerageAmount: Number(fields.brokerage), otherChargesAmount: Number(fields.otherCharges), chargesBasis: "manual" as const } : { chargesBasis: "estimated" as const }),
        price: Math.abs(grossSigned), entryPrice: Number(fields.entryPrice), exitPrice: Number(fields.exitPrice), positionSide: trade.direction,
        quantity: Number(fields.quantity), instrument: fields.instrument.trim(), strikePrice: Number(fields.strike),
        optionType: fields.optionType as "CE" | "PE", expiryDate: fields.expiry, category: "Business Trade",
        ...(trade.entryOrderId || trade.exitOrderId ? { sourceOrderIds: [trade.entryOrderId, trade.exitOrderId].filter(Boolean) } : {}),
        note: `${trade.instrument} ${trade.strike} ${trade.optionType} · matched orders ${[trade.entryOrderId, trade.exitOrderId].filter(Boolean).join(" / ") || "IDs unavailable"}`,
      };
    });
    const investments: Investment[] = matching.open.map(({ order, remaining }) => ({
      id: crypto.randomUUID(), name: `${order.instrument} ${order.strike} ${order.optionType} ${order.expiry}`,
      type: "other", amount: Number(order.price) * remaining, currentValue: Number(order.price) * remaining,
      quantity: remaining, entryPrice: Number(order.price), positionSide: order.side === "BUY" ? "long" : "short", date: new Date(`${order.date}T12:00:00`).toISOString(),
      ...(order.orderId ? { sourceOrderId: order.orderId } : {}),
      note: `Open ${order.side.toLowerCase()} position remainder from order ${order.orderId ?? "without an ID"}. Initial value reflects entry cost; update value in Investment.`,
    }));
    if (pendingTrades.length) {
      setMessage(`${pendingTrades.length} included transaction draft${pendingTrades.length === 1 ? " needs" : "s need"} missing fields. Complete or exclude each draft before saving.`); return;
    }
    if (!transactions.length && !investments.length) {
      setMessage("No completed trades or valid open positions are ready to save. Resolve the flagged order rows first."); return;
    }
    try {
      if (!onSaveReviewed(transactions, investments)) {
        setMessage("Nothing was saved. Check for locked transaction months."); return;
      }
      setReviewOpen(false); setOrders([]); setTradeOverrides({});
      setEntry(""); setExit(""); setQuantity(""); setCharges(""); setNote("");
      setMessage(`Saved ${transactions.length} transaction${transactions.length === 1 ? "" : "s"}${investments.length ? ` and ${investments.length} open investment position${investments.length === 1 ? "" : "s"}` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the reviewed import.");
    }
  };

  const analyzeFiles = async (selected: Attachment[]) => {
    if (!selected.length) return;
    setProcessing(true); setMessage(""); setOcrStatus("Loading PaddleOCR in your browser…");
    let ocr: PaddleEngine | null = null;
    const extractedPages: string[] = [];
    try {
      const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
      ocr = await PaddleOCR.create({ lang: "en", ocrVersion: "PP-OCRv5", worker: true, ortOptions: { backend: "auto" } });
      const recognize = async (input: File | HTMLCanvasElement) => {
        const [result] = await ocr!.predict(input);
        return getPaddleLayoutText(result?.items ?? []);
      };
      for (const item of selected) {
        if (isPdf(item.file)) {
          const pdf = await pdfjs.getDocument({ data: await item.file.arrayBuffer() }).promise;
          const pageCount = Math.min(pdf.numPages, 10);
          for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            setOcrStatus(`Reading ${item.file.name}, page ${pageNumber} of ${pageCount}…`);
            const page = await pdf.getPage(pageNumber);
            const textContent = await page.getTextContent();
            const textItems = textContent.items.filter((entry): entry is typeof entry & { str: string; transform: number[] } => "str" in entry && "transform" in entry && Boolean(entry.str.trim()));
            const positionedItems = textItems.map((entry) => ({ text: entry.str.trim(), x: entry.transform[4], y: entry.transform[5] })).sort((a, b) => b.y - a.y || a.x - b.x);
            const pdfText = positionedItems.map((entry) => entry.text).join(" ");
            if (pdfText.length > 80 && /\b(BUY|SELL)\b/i.test(pdfText)) {
              const rows: Array<{ y: number; cells: typeof positionedItems }> = [];
              for (const cell of positionedItems) {
                let row = rows.find((candidate) => Math.abs(candidate.y - cell.y) < 4);
                if (!row) { row = { y: cell.y, cells: [] }; rows.push(row); }
                row.cells.push(cell);
              }
              extractedPages.push(`Source: ${item.file.name}, page ${pageNumber}\n${rows.sort((a, b) => b.y - a.y).map((row) => row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join(" ")).join("\n")}`);
              page.cleanup();
              continue;
            }
            const viewport = page.getViewport({ scale: 1.7 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Could not prepare a PDF page for local OCR.");
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            extractedPages.push(`Source: ${item.file.name}, page ${pageNumber}\n${await recognize(canvas)}`);
            canvas.width = 0; canvas.height = 0;
          }
          if (pdf.numPages > 10) extractedPages.push(`Review flag: ${item.file.name} has ${pdf.numPages} pages; only the first 10 were analyzed.`);
        } else {
          setOcrStatus(`Reading ${item.file.name}…`);
          const canvas = await makeOcrCanvas(item.file);
          try { extractedPages.push(`Source: ${item.file.name}\n${await recognize(canvas)}`); }
          finally { canvas.width = 0; canvas.height = 0; }
        }
      }
      const text = extractedPages.join("\n\n").trim();
      if (!text) throw new Error("No readable text was found. Try a clearer image or PDF.");
      applyExtraction(text);
      setOcrStatus("Reading complete. Check every extracted field against the attached order.");
    } catch (error) {
      setOcrStatus("");
      setMessage(error instanceof Error ? error.message : "Could not read this file. Try another image or PDF.");
    } finally {
      if (ocr) await ocr.dispose();
      setProcessing(false);
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const supported = Array.from(list).filter((file) => isSupportedDocument(file) && file.size <= 20 * 1024 * 1024);
    if (supported.length !== list.length) setMessage("Some files were skipped. Use PNG, JPG, WEBP, or PDF files up to 20 MB each.");
    const additions = supported.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    setFiles((current) => [...current, ...additions]);
    void analyzeFiles(additions);
  };

  const save = () => {
    if (!instrument.trim() || !optionType || !expiry || gross === null || !date || Number(charges) < 0) {
      setMessage("Complete the instrument, CE/PE, expiry, date, prices, quantity, and valid charges before saving."); return;
    }
    const cost = charges === "" ? manualConfiguredCost.amount : Number(charges);
    const net = gross - cost;
    const tx: Transaction = {
      id: crypto.randomUUID(), date: new Date(`${date}T12:00:00`).toISOString(),
      type: net >= 0 ? "profit" : "loss", amount: Math.abs(net), grossAmount: Math.abs(gross),
      costAmount: cost, price: Math.abs(gross), entryPrice: Number(entry), exitPrice: Number(exit), positionSide: side,
      quantity: Number(quantity), instrument: instrument.trim().toUpperCase(), optionType,
      strikePrice: Number(strike) || undefined, expiryDate: expiry, category: "Business Trade",
      note: [instrument.trim().toUpperCase(), strike && strike, optionType, note.trim()].filter(Boolean).join(" "),
    };
    try {
      const saved = onSave(tx);
      if (saved === false) { setMessage("This transaction was not saved. Choose a weekday and check that its month is not locked."); return; }
      setMessage("Transaction saved. You can review it in Transactions.");
      setEntry(""); setExit(""); setQuantity(""); setCharges(""); setNote("");
      setReviewFlag("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this transaction. Export a backup and try again.");
    }
  };

  return <div className="page-content">
    <div className="page-heading"><div><span className="eyebrow">TRADE REVIEW</span><h1>AI Analysis</h1><p>Attach an order image or PDF, then verify every value before adding a transaction.</p></div></div>
    <div className="ai-import-card">
      <div className="ai-import-notice"><ShieldCheck size={19}/><div><strong>Files are analyzed on this device.</strong><span>PaddleOCR detects text in your browser; your files are not uploaded or saved. The OCR model may download the first time you use it. Extracted fields can be wrong, so verify every value. Up to 10 pages per PDF are analyzed.</span></div></div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }} />
      <button type="button" className="secondary-button" disabled={processing} onClick={() => inputRef.current?.click()}><ImagePlus size={17}/> Attach screenshots or PDFs</button>
      {processing && <p className="ai-message" role="status"><LoaderCircle size={15} className="ai-spinner"/> {ocrStatus}</p>}
      {!processing && ocrStatus && <p className="ai-message" role="status">{ocrStatus}</p>}
      {files.length > 0 && <div className="ai-file-list">{files.map((item) => <div className="ai-file" key={item.id}>
        {isPdf(item.file) ? <iframe title={`Preview ${item.file.name}`} src={item.url}/> : <img src={item.url} alt={`Order screenshot ${item.file.name}`}/>}
        <div><FileText size={15}/><span title={item.file.name}>{item.file.name}</span><button type="button" className="table-btn-icon delete" aria-label={`Remove ${item.file.name}`} onClick={() => { URL.revokeObjectURL(item.url); setFiles((current) => current.filter((f) => f.id !== item.id)); }}><Trash2 size={15}/></button></div>
      </div>)}</div>}
    </div>
    <details className="ai-import-card ai-manual-entry">
      <summary>Enter a single trade manually</summary>
      <div className="ai-manual-entry-content">
      <h2>Review trade details</h2><p className="ai-muted">Enter the completed trade values shown on your order. Cancelled or unfilled orders should not be recorded here.</p>
      {reviewFlag && <div className="ai-review-flag">{reviewFlag === "low" ? "Low OCR match: fields were left blank where the source was unclear." : "OCR suggestions found. Verify all fields before confirming."}</div>}
      {ocrText && <details className="ai-ocr-details"><summary>Review extracted source text</summary><textarea readOnly rows={8} value={ocrText} aria-label="Text extracted from attachments"/></details>}
      <div className="ai-form-grid">
        <label>Underlying / instrument<input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="e.g. NIFTY"/></label>
        <label>Strike price<input type="number" min="0" step="any" value={strike} onChange={(e) => setStrike(e.target.value)}/></label>
        <label>Option type<select value={optionType} onChange={(e) => setOptionType(e.target.value as "" | "CE" | "PE")}><option value="">Select CE or PE</option><option value="CE">CE</option><option value="PE">PE</option></select></label>
        <label>Expiry date<input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}/></label>
        <label>Position<select value={side} onChange={(e) => setSide(e.target.value as "long" | "short")}><option value="long">Buy then sell (long)</option><option value="short">Sell then buy (short)</option></select></label>
        <label>Trade date<input type="date" value={date} onChange={(e) => setDate(e.target.value)}/></label>
        <label>Entry price<input type="number" min="0.000001" step="any" value={entry} onChange={(e) => setEntry(e.target.value)}/></label>
        <label>Exit price<input type="number" min="0.000001" step="any" value={exit} onChange={(e) => setExit(e.target.value)}/></label>
        <label>Filled quantity<input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)}/></label>
        <label>Charges (optional)<input type="number" min="0" step="0.01" value={charges} onChange={(e) => setCharges(e.target.value)} placeholder={`Default cost: ${user.defaultCostAmount}`}/></label>
        <label className="ai-wide">Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Order ID, broker, source details"/></label>
      </div>
      {gross !== null && <div className="ai-pnl-preview"><span>Gross P&amp;L</span><strong className={gross >= 0 ? "profit" : "loss"}>{formatCurrency(gross, user.currency)}</strong><small>Net P&amp;L: {formatCurrency(gross - (charges === "" ? manualConfiguredCost.amount : Number(charges)), user.currency)} · {charges === "" ? `${manualConfiguredCost.name} from Settings (${formatCurrency(manualConfiguredCost.amount, user.currency)})` : "using entered charges"}</small></div>}
      {message && <p className="ai-message" role="status">{message}</p>}
      <button className="primary-button" type="button" disabled={processing} onClick={save}>Confirm and add transaction</button>
      </div>
    </details>
    {orders.length > 0 && <button type="button" className="secondary-button" onClick={() => setReviewOpen(true)}>Review detected orders ({orders.length})</button>}
    {reviewOpen && <div className="ai-review-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewOpen(false); }}>
      <section className="ai-review-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-review-title">
        <header className="ai-review-header"><div><span className="eyebrow">IMPORT REVIEW</span><h2 id="ai-review-title">Review detected orders</h2><p>OCR found {orders.length} order row{orders.length === 1 ? "" : "s"}. Correct any fields before confirming.</p></div><button type="button" className="close-button" onClick={() => setReviewOpen(false)} aria-label="Close order review">×</button></header>
        <div className="ai-review-summary"><span><strong>{readyTrades.length}</strong> transactions ready to save</span><span><strong>{pendingTrades.length}</strong> included drafts blocked by missing fields</span><span><strong>{identityReviewTrades.length}</strong> pairs excluded until you verify them</span><span><strong>{matching.open.length}</strong> open position remainder{matching.open.length === 1 ? "" : "s"}</span><span><strong>{matching.unresolved.length}</strong> unresolved order rows</span></div>
        {!readyTrades.length && !matching.open.length && <div className="ai-review-warning">Nothing will be saved until at least one trade is ready. {pendingTrades.length ? `Complete these fields in the included trade card(s): ${pendingFieldNames.join(", ")}.` : "Verify and include a complete buy/sell pair below."} The save button stays disabled while there are no ready transactions or investments.</div>}
        <p className="ai-muted">Missing average prices: {orders.filter((order) => order.include && !(Number(order.price) > 0)).length} · Missing contract details: {orders.filter((order) => order.include && (!order.instrument || !order.strike || !order.optionType || !order.expiry)).length} · Missing order dates: {orders.filter((order) => order.include && !order.date).length}</p>
        <h3>Detected order rows</h3>
        <div className="ai-order-list">{orders.map((order, index) => <article className="ai-order-card" key={order.id}>
          <div className="ai-order-card-head"><label><input type="checkbox" checked={order.include} onChange={(event) => updateOrder(order.id, "include", event.target.checked)}/> Include order {index + 1}</label><span>{getOrderReviewIssue(order)}</span></div>
          <div className="ai-order-grid">
            <label>Instrument<input value={order.instrument} onChange={(event) => updateOrder(order.id, "instrument", event.target.value.toUpperCase())}/></label>
            <label>Strike<input inputMode="numeric" value={order.strike} onChange={(event) => updateOrder(order.id, "strike", event.target.value)}/></label>
            <label>CE / PE<select value={order.optionType} onChange={(event) => updateOrder(order.id, "optionType", event.target.value)}><option value="">Unresolved</option><option value="CE">CE</option><option value="PE">PE</option></select></label>
            <label>Expiry<input type="date" value={order.expiry} onChange={(event) => updateOrder(order.id, "expiry", event.target.value)}/></label>
            <label>Side<select value={order.side} onChange={(event) => updateOrder(order.id, "side", event.target.value)}><option>BUY</option><option>SELL</option></select></label>
            <label>Status<input value={order.status} onChange={(event) => updateOrder(order.id, "status", event.target.value.toUpperCase())}/></label>
            <label>Filled<input inputMode="numeric" value={order.filled} onChange={(event) => updateOrder(order.id, "filled", event.target.value)}/></label>
            <label>Requested<input inputMode="numeric" value={order.requested} onChange={(event) => updateOrder(order.id, "requested", event.target.value)}/></label>
            <label>Avg. price<input inputMode="decimal" value={order.price} onChange={(event) => updateOrder(order.id, "price", event.target.value)}/></label>
            <label>Order date<input type="date" value={order.date} onChange={(event) => updateOrder(order.id, "date", event.target.value)}/></label>
          </div>
          <small>{order.source} · {order.orderId ? `Order ID ${order.orderId} · ` : ""}{order.possibleDuplicateOf ? "Possible duplicate/conflicting order ID · " : ""}OCR: {order.raw}</small>
        </article>)}</div>
        <h3>Transaction review · one card per buy/sell pair</h3>
        {reviewTrades.length ? <div className="ai-result-list">{reviewTrades.map(({ trade, fields, ready, missingFields, gross, net, feeValuesReady, configuredCost }) => <article className="ai-trade-draft" key={trade.id}>
          <div className="ai-trade-draft-head"><label><input type="checkbox" checked={fields.include} onChange={(event) => updateTrade(trade.id, "include", event.target.checked)}/> {trade.needsIdentityConfirmation ? "I verified both order legs are the same contract; include this trade" : "Include transaction"}</label><strong>{trade.needsIdentityConfirmation ? fields.include ? ready ? "Pair verified · ready to save" : "Pair included · required fields still missing" : "Excluded until you verify the contract" : `${trade.direction.toUpperCase()} · ${ready ? "Ready to save" : "Required fields missing"}`}</strong></div>
          <small>Paired from {trade.entryOrderId || trade.entryRowId} and {trade.exitOrderId || trade.exitRowId}. Verify these two order legs are the same contract.</small>
          {fields.include && missingFields.length > 0 && <div className="ai-review-warning">This transaction is not included in the save count yet. Missing: {missingFields.join(", ")}.</div>}
          <div className="ai-trade-draft-grid">
            <label>Underlying<input value={fields.instrument} onChange={(event) => updateTrade(trade.id, "instrument", event.target.value.toUpperCase())}/></label>
            <label>Strike<input inputMode="numeric" value={fields.strike} onChange={(event) => updateTrade(trade.id, "strike", event.target.value)}/></label>
            <label>CE / PE<select value={fields.optionType} onChange={(event) => updateTrade(trade.id, "optionType", event.target.value)}><option value="">Select</option><option value="CE">CE</option><option value="PE">PE</option></select></label>
            <label>Expiry<input type="date" value={fields.expiry} onChange={(event) => updateTrade(trade.id, "expiry", event.target.value)}/></label>
            <label>Trade date<input type="date" value={fields.date} onChange={(event) => updateTrade(trade.id, "date", event.target.value)}/></label>
            <label>Matched quantity<input type="number" min="1" step="1" value={fields.quantity} readOnly title="Quantity comes from the matched filled quantities above. Correct an order's filled quantity in its order row."/></label>
            <label>Entry price · {trade.direction === "long" ? "BUY" : "SELL"}<input type="number" min="0.000001" step="any" value={fields.entryPrice} onChange={(event) => updateTrade(trade.id, "entryPrice", event.target.value)}/></label>
            <label>Exit price · {trade.direction === "long" ? "SELL" : "BUY"}<input type="number" min="0.000001" step="any" value={fields.exitPrice} onChange={(event) => updateTrade(trade.id, "exitPrice", event.target.value)}/></label>
        <label>Cost source<select value={fields.chargesMode} onChange={(event) => updateTrade(trade.id, "chargesMode", event.target.value)}><option value="configured">Saved cost from Settings</option><option value="manual">Enter fee breakdown</option></select></label>
            {fields.chargesMode === "manual" ? <>
              <label>Brokerage<input type="number" min="0" step="0.01" value={fields.brokerage} onChange={(event) => updateTrade(trade.id, "brokerage", event.target.value)} placeholder="Enter actual or estimated brokerage"/></label>
              <label>Other charges<input type="number" min="0" step="0.01" value={fields.otherCharges} onChange={(event) => updateTrade(trade.id, "otherCharges", event.target.value)} placeholder="Enter taxes / fees, or 0"/></label>
            </> : <div className="ai-configured-fee">Saved cost schedule ({configuredCost.name}) for {fields.date || "selected trade date"}: <strong>{formatCurrency(configuredCost.amount, user.currency)}</strong>.</div>}
          </div>
          {Number(fields.entryPrice) > 0 && Number(fields.exitPrice) > 0 && Number(fields.quantity) > 0 && <div className="ai-trade-pnl"><span>Gross P&amp;L <b className={gross >= 0 ? "profit" : "loss"}>{formatCurrency(gross, user.currency)}</b></span>{fields.chargesMode === "manual" ? <><span>Brokerage <b>{fields.brokerage === "" ? "Not entered" : formatCurrency(Number(fields.brokerage), user.currency)}</b></span><span>Other charges <b>{fields.otherCharges === "" ? "Not entered" : formatCurrency(Number(fields.otherCharges), user.currency)}</b></span></> : <span>{configuredCost.name} <b>{formatCurrency(configuredCost.amount, user.currency)}</b></span>}<span>Net P&amp;L <b className={feeValuesReady ? net >= 0 ? "profit" : "loss" : ""}>{feeValuesReady ? formatCurrency(net, user.currency) : "Unavailable · enter fees"}</b></span></div>}
        </article>)}</div> : <p className="ai-muted">No opposite-side order pairs were found. Correct order sides or exclude unrelated rows.</p>}
        <h3>Unmatched open positions</h3>
        {matching.open.length ? <div className="ai-result-list">{matching.open.map(({ order, remaining }) => <article key={order.id}><strong>{order.side} {order.instrument} {order.strike} {order.optionType}</strong><span>{remaining} remaining at {formatCurrency(Number(order.price), user.currency)} per unit. Will be added to Investments without realized P&amp;L.</span></article>)}</div> : <p className="ai-muted">None.</p>}
        {matching.unresolved.length > 0 && <div className="ai-review-warning">{matching.unresolved.length} row{matching.unresolved.length === 1 ? "" : "s"} need correction or exclusion. They will not be imported as trades or investments.</div>}
        {orders.some((order) => !order.include) && <p className="ai-muted">Cancelled / excluded orders will not count toward quantity or P&amp;L.</p>}
        <footer className="ai-review-footer"><button type="button" className="secondary-button" onClick={() => setReviewOpen(false)}>Keep reviewing</button><button type="button" className="primary-button" disabled={pendingTrades.length > 0 || (!readyTrades.length && !matching.open.length)} onClick={confirmReviewedOrders}>{readyTrades.length || matching.open.length ? `Confirm and save ${readyTrades.length} transactions + ${matching.open.length} investments` : `0 ready · ${pendingTrades.length ? "complete required fields above" : "verify and include a trade"}`}</button></footer>
      </section>
    </div>}
  </div>;
};

export default AIAnalysis;
