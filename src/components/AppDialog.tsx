import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertCircle, HelpCircle } from "lucide-react";

type DialogRequest = { title: string; message: string; confirm: boolean };
type AppDialogApi = {
  alert: (message: string, title?: string) => Promise<void>;
  confirm: (message: string, title?: string) => Promise<boolean>;
};

const AppDialogContext = createContext<AppDialogApi | null>(null);

export const useAppDialog = () => {
  const api = useContext(AppDialogContext);
  if (!api) throw new Error("useAppDialog must be used within AppDialogProvider");
  return api;
};

export const AppDialogProvider = ({ children }: { children: React.ReactNode }) => {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const open = useCallback((next: DialogRequest) => new Promise<boolean>((resolve) => {
    resolveRef.current = resolve;
    setRequest(next);
  }), []);
  const alert = useCallback(async (message: string, title = "Notice") => {
    await open({ message, title, confirm: false });
  }, [open]);
  const confirm = useCallback((message: string, title = "Please confirm") =>
    open({ message, title, confirm: true }), [open]);
  const finish = (confirmed: boolean) => {
    setRequest(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(confirmed);
  };
  const api = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  return <AppDialogContext.Provider value={api}>
    {children}
    {request && <div className="app-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) finish(false);
    }}>
      <section className="app-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message" onKeyDown={(event) => {
        if (event.key === "Escape") finish(false);
      }}>
        <div className="app-dialog-heading">
          <span className="app-dialog-icon">{request.confirm ? <HelpCircle size={20} /> : <AlertCircle size={20} />}</span>
          <div><h2 id="app-dialog-title">{request.title}</h2><p id="app-dialog-message">{request.message}</p></div>
        </div>
        <div className="app-dialog-actions">
          {request.confirm && <button type="button" className="secondary-button" onClick={() => finish(false)}>Cancel</button>}
          <button type="button" className="primary-button" autoFocus onClick={() => finish(true)}>{request.confirm ? "Confirm" : "OK"}</button>
        </div>
      </section>
    </div>}
  </AppDialogContext.Provider>;
};
