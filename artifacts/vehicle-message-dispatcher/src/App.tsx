import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AlertCircle, ArrowUpRight, Bell, Check, CheckCircle2, ChevronDown, ClipboardCheck, CloudUpload, FileSpreadsheet, Filter, Info, LayoutDashboard, Link2, LogOut, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, Pencil, RefreshCw, Search, Send, Settings2, ShieldCheck, Sparkles, Upload, Users, X, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';
import { AuthGate } from '@/components/auth-gate';
import { supabase } from '@/lib/supabase';
import { getWhatsAppMessageStatuses, sendWhatsAppMessage } from '@workspace/api-client-react';

const queryClient = new QueryClient();

type DeliveryStatus = 'pending' | 'ready' | 'blocked' | 'sent' | 'delivered' | 'read' | 'failed';
type DriverRecord = {
  id: string;
  vehicle: string;
  duties: number;
  message: string;
  mobile: string;
  driver: string;
  status: DeliveryStatus;
  whatsappMessageId?: string;
};

const sampleRecords: DriverRecord[] = [
  { id: 'VH-1042', vehicle: 'VH-1042', duties: 3, message: 'Hi {{DriverName}}, you have 3 pending duties to review today. Please confirm your availability with the desk.', mobile: '+91 98765 44102', driver: 'Rakesh Kumar', status: 'ready' },
  { id: 'VH-1188', vehicle: 'VH-1188', duties: 1, message: 'Hi {{DriverName}}, one duty is waiting for your confirmation today. Please check in with the desk.', mobile: '+91 98204 11880', driver: 'Meena Shah', status: 'ready' },
  { id: 'VH-0921', vehicle: 'VH-0921', duties: 5, message: 'Hi {{DriverName}}, you have 5 pending duties to review today. Please confirm your availability with the desk.', mobile: '', driver: 'Arjun Patel', status: 'blocked' },
  { id: 'VH-0764', vehicle: 'VH-0764', duties: 2, message: 'Hi {{DriverName}}, you have 2 pending duties to review today. Please confirm your availability with the desk.', mobile: '+91 99102 77640', driver: 'Sanjay Rao', status: 'ready' },
  { id: 'VH-1310', vehicle: 'VH-1310', duties: 4, message: '', mobile: '+91 98011 23104', driver: 'Nisha Verma', status: 'pending' },
  { id: 'VH-1107', vehicle: 'VH-1107', duties: 1, message: 'Hi {{DriverName}}, one duty is waiting for your confirmation today. Please check in with the desk.', mobile: '+91 98921 81107', driver: 'Dev Malhotra', status: 'ready' },
];

const baseTemplate = 'Hi {{DriverName}}, you have {{Pending Duty Count}} pending duties to review today. Please confirm your availability with the desk.';

function statusFor(record: Omit<DriverRecord, 'status'>): DeliveryStatus {
  if (!record.mobile) return 'blocked';
  if (!record.message.trim()) return 'pending';
  return 'ready';
}

function normalizeKey(value: unknown) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}

function AppShell() {
  const [records, setRecords] = useState<DriverRecord[]>(sampleRecords);
  const [selected, setSelected] = useState<string[]>(sampleRecords.map((record) => record.id));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | DeliveryStatus>('all');
  const [template, setTemplate] = useState(baseTemplate);
  const [fileName, setFileName] = useState('sample-duty-sheet.xlsx');
  const [setupOpen, setSetupOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState(() => localStorage.getItem('whatsapp-phone-number-id') ?? '');
  const [mobileNav, setMobileNav] = useState(false);
  const [activity, setActivity] = useState('Sample duty sheet loaded. Review the queue before preparing a send.');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredRecords = useMemo(() => records.filter((record) => {
    const matchesQuery = [record.driver, record.vehicle, record.mobile].join(' ').toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === 'all' || record.status === filter);
  }), [filter, query, records]);

  const counts = useMemo(() => ({
    all: records.length,
    pending: records.filter((record) => record.status === 'pending').length,
    ready: records.filter((record) => record.status === 'ready').length,
    blocked: records.filter((record) => record.status === 'blocked').length,
    duties: records.reduce((sum, record) => sum + record.duties, 0),
  }), [records]);

  const allVisibleSelected = filteredRecords.length > 0 && filteredRecords.every((record) => selected.includes(record.id));
  const pendingStatusIds = useMemo(
    () => records
      .filter((record) => record.whatsappMessageId && record.status === 'sent')
      .map((record) => record.whatsappMessageId as string),
    [records],
  );

  useEffect(() => {
    if (!pendingStatusIds.length) return;
    let stopped = false;
    let requestInFlight = false;

    async function syncStatuses() {
      if (stopped || requestInFlight) return;
      requestInFlight = true;
      try {
        const result = await getWhatsAppMessageStatuses({ messageIds: pendingStatusIds.join(',') });
        if (stopped || !result.statuses.length) return;
        const updates = new Map(result.statuses.map((status) => [status.messageId, status]));
        setRecords((current) => current.map((record) => {
          const update = record.whatsappMessageId ? updates.get(record.whatsappMessageId) : undefined;
          if (!update || !record.whatsappMessageId) return record;
          const nextStatus = update.status === 'accepted' ? 'sent' : update.status;
          return record.status === nextStatus ? record : { ...record, status: nextStatus };
        }));
        const latest = result.statuses[result.statuses.length - 1];
        if (latest.status === 'failed') {
          setActivity(`WhatsApp reported a delivery failure${latest.detail ? `: ${latest.detail}` : '.'}`);
        } else if (latest.status === 'delivered' || latest.status === 'read') {
          setActivity(`WhatsApp status updated to ${latest.status}.`);
        }
      } catch {
        // Webhook status polling is best-effort; the send result remains visible.
      } finally {
        requestInFlight = false;
      }
    }

    void syncStatuses();
    const interval = window.setInterval(() => void syncStatuses(), 4000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [pendingStatusIds]);

  function updateRecord(id: string, patch: Partial<DriverRecord>) {
    setRecords((current) => current.map((record) => {
      if (record.id !== id) return record;
      const next = { ...record, ...patch };
      return { ...next, status: statusFor(next) };
    }));
  }

  function fillMessage(record: DriverRecord) {
    return template
      .replaceAll('{{DriverName}}', record.driver)
      .replaceAll('{{Pending Duty Count}}', String(record.duties));
  }

  function applyTemplate() {
    const targets = selected.length ? selected : records.map((record) => record.id);
    setRecords((current) => current.map((record) => targets.includes(record.id) ? { ...record, message: fillMessage(record), status: statusFor({ ...record, message: fillMessage(record) }) } : record));
    setActivity(`${targets.length} personalized ${targets.length === 1 ? 'message' : 'messages'} updated from the template.`);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const imported = rows.map((row, index) => {
        const values = Object.entries(row);
        const get = (names: string[]) => values.find(([key]) => names.includes(normalizeKey(key)))?.[1] ?? '';
        const vehicle = String(get(['vehiclenumber', 'vehicle', 'vehicleno']) || `Row ${index + 2}`);
        const driver = String(get(['drivername', 'driver', 'name']));
        const duties = Number(get(['pendingdutycount', 'pendingduties', 'duties'])) || 0;
        const message = String(get(['massage', 'message', 'messagetemplate']));
        const mobile = String(get(['mobileno', 'mobilenumber', 'mobile', 'phone']));
        const draft = { id: `${vehicle}-${index}`, vehicle, driver, duties, message, mobile };
        return { ...draft, status: statusFor(draft) };
      }).filter((record) => record.driver || record.vehicle);
      if (!imported.length) throw new Error('No recognizable rows');
      setRecords(imported);
      setSelected(imported.map((record) => record.id));
      setActivity(`${imported.length} rows imported from ${file.name}.`);
    } catch {
      setActivity('This file could not be read. Check the column names and try again.');
    } finally {
      event.target.value = '';
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelected((current) => current.filter((id) => !filteredRecords.some((record) => record.id === id)));
    } else {
      setSelected((current) => Array.from(new Set([...current, ...filteredRecords.map((record) => record.id)])));
    }
  }

  async function prepareSend() {
    const chosen = records.filter((record) => selected.includes(record.id));
    const ready = chosen.filter((record) => record.status === 'ready');
    if (!ready.length) {
      setActivity('Select at least one ready message to send.');
      return;
    }
    if (!phoneNumberId.trim()) {
      setSetupOpen(true);
      setActivity('Add your WhatsApp phone number ID before sending.');
      return;
    }
    setActivity(`Sending ${ready.length} ${ready.length === 1 ? 'message' : 'messages'} through WhatsApp…`);
    let sent = 0;
    for (const record of ready) {
      try {
        const result = await sendWhatsAppMessage({
          phoneNumberId: phoneNumberId.trim(),
          to: record.mobile,
          message: fillMessage(record),
        });
        setRecords((current) => current.map((item) => item.id === record.id ? {
          ...item,
          status: result.accepted ? 'sent' : 'failed',
          whatsappMessageId: result.messageId ?? undefined,
        } : item));
        sent += result.accepted ? 1 : 0;
      } catch {
        setRecords((current) => current.map((item) => item.id === record.id ? { ...item, status: 'failed' } : item));
      }
    }
    setActivity(`${sent} of ${ready.length} ${ready.length === 1 ? 'message was' : 'messages were'} accepted by WhatsApp. Delivery is asynchronous.`);
  }

  function loadSampleData() {
    setRecords(sampleRecords);
    setSelected(sampleRecords.map((record) => record.id));
    setFileName('sample-duty-sheet.xlsx');
    setActivity('Sample duty sheet loaded. Review the queue before preparing a send.');
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar py-6 text-sidebar-foreground transition-transform duration-200 lg:translate-x-0 lg:transition-none ${sidebarCollapsed ? 'w-[76px] px-3' : 'w-[252px] px-5'} ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className={`flex items-center ${sidebarCollapsed ? 'flex-col gap-3' : 'justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary"><MessageCircle size={21} strokeWidth={2.5} /></div>
            {!sidebarCollapsed && <div>
              <div className="font-display text-[17px] font-bold tracking-tight">FleetRelay</div>
              <div className="font-mono-app text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/50">fleet operations</div>
            </div>}
          </div>
          <div className="flex items-center gap-1">
            <button data-testid="button-toggle-sidebar" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((value) => !value)} className="hidden h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border text-sidebar-foreground/60 hover:bg-sidebar-accent lg:inline-flex">{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
            <button data-testid="button-close-mobile-nav" aria-label="Close navigation" onClick={() => setMobileNav(false)} className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden"><X size={17} /></button>
          </div>
        </div>
        <div className="mt-12">
          <nav className="space-y-1">
            <button data-testid="button-nav-dispatch" title="Duty dispatch" className={`flex w-full items-center gap-3 rounded-xl bg-sidebar-accent py-3 text-sm font-semibold text-sidebar-accent-foreground ${sidebarCollapsed ? 'justify-center px-0' : 'px-3'}`}><LayoutDashboard size={17} /> {!sidebarCollapsed && <>Duty dispatch <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 font-mono-app text-[10px] font-medium text-secondary-foreground">{counts.all}</span></>}</button>
            <button data-testid="button-nav-drivers" title="Driver directory" onClick={() => setActivity('Driver directory is available through today’s imported duty sheet.')} className={`flex w-full items-center gap-3 rounded-xl py-3 text-sm text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${sidebarCollapsed ? 'justify-center px-0' : 'px-3'}`}><Users size={17} /> {!sidebarCollapsed && 'Driver directory'}</button>
            <button data-testid="button-nav-settings" title="Connection settings" onClick={() => setSetupOpen(true)} className={`flex w-full items-center gap-3 rounded-xl py-3 text-sm text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${sidebarCollapsed ? 'justify-center px-0' : 'px-3'}`}><Settings2 size={17} /> {!sidebarCollapsed && 'Connection settings'}</button>
          </nav>
        </div>
      </aside>

      <main className={`transition-[padding-left] duration-200 ease-out ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[252px]'}`}>
        <header className="flex h-[72px] items-center justify-between border-b border-border/80 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button data-testid="button-open-mobile-nav" aria-label="Open navigation" onClick={() => setMobileNav(true)} className="rounded-xl p-2 hover:bg-muted lg:hidden"><Menu size={21} /></button>
            <div className="hidden text-xs font-semibold text-foreground sm:block">Duty dispatch</div>
            <div className="text-xs font-semibold sm:hidden">Duty dispatch</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#3d9b7b]" /> Today, 08:42 IST</div>
            <button data-testid="button-notifications" aria-label="Notifications" onClick={() => setActivity('No new operational alerts.')} className="rounded-xl p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><Bell size={18} /></button>
            <button type="button" data-testid="button-sign-out" aria-label="Sign out" title="Sign out" onClick={() => void supabase.auth.signOut()} className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground transition hover:bg-secondary"><LogOut size={16} /></button>
          </div>
        </header>

        <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 lg:px-10">
          <section className="rise-in flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 font-mono-app text-[10px] uppercase tracking-[.18em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-[#3d9b7b]" /> Monday, 14 October 2024</div>
              <h1 className="font-display text-4xl font-bold tracking-[-.045em] text-primary sm:text-5xl">Duty dispatch</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button data-testid="button-load-sample" onClick={loadSampleData} className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-3 text-xs font-bold text-foreground transition hover:bg-muted sm:inline-flex"><FileSpreadsheet size={15} /> Load sample</button>
              <button data-testid="button-upload-sheet" onClick={() => fileInputRef.current?.click()} className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90"><Upload size={16} /> Import duty sheet <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></button>
            </div>
            <input ref={fileInputRef} data-testid="input-duty-sheet" onChange={handleUpload} className="hidden" type="file" accept=".xlsx,.xls,.csv" />
          </section>

          <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Drivers in sheet" value={formatNumber(counts.all)} detail={`${selected.length} selected`} icon={<Users size={17} />} tone="cream" />
            <StatCard label="Pending duties" value={formatNumber(counts.duties)} detail="Across this sheet" icon={<ClipboardCheck size={17} />} tone="teal" />
            <StatCard label="Ready to review" value={formatNumber(counts.ready)} detail="Message + mobile present" icon={<CheckCircle2 size={17} />} tone="yellow" />
            <StatCard label="Needs attention" value={formatNumber(counts.pending + counts.blocked)} detail={`${counts.blocked} missing mobile`} icon={<AlertCircle size={17} />} tone="rose" />
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_355px]">
            <div className="min-w-0">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div><div className="flex items-center gap-2"><h2 className="font-display text-xl font-bold tracking-tight">Driver queue</h2><span data-testid="text-visible-count" className="rounded-full bg-muted px-2 py-1 font-mono-app text-[10px] font-medium text-muted-foreground">{filteredRecords.length} shown</span></div></div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-52"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input data-testid="input-search-drivers" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search driver or vehicle" className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none transition placeholder:text-muted-foreground/65 focus:border-ring focus:ring-2 focus:ring-ring/15" /></div>
                  <button data-testid="button-filter-menu" onClick={() => setFilter(filter === 'all' ? 'ready' : filter === 'ready' ? 'pending' : filter === 'pending' ? 'blocked' : 'all')} className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${filter !== 'all' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}><Filter size={14} /> <span className="hidden sm:inline">{filter === 'all' ? 'Filter' : filter}</span><ChevronDown size={13} /></button>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                <div className="flex items-center justify-between border-b border-border bg-[#f8f4eb] px-4 py-3 text-xs">
                  <label className="flex items-center gap-3 font-semibold"><input data-testid="checkbox-select-visible" type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 accent-[#18363a]" /> Select visible <span className="font-normal text-muted-foreground">({selected.length} total)</span></label>
                  <div className="flex items-center gap-3"><span data-testid="text-file-name" className="hidden items-center gap-1.5 font-mono-app text-[10px] text-muted-foreground sm:flex"><FileSpreadsheet size={14} /> {fileName}</span>{records.length > 0 && <button data-testid="button-clear-sheet" onClick={() => { setRecords([]); setSelected([]); setFileName('No file loaded'); setActivity('Queue cleared. Load a sample sheet or import today’s file to begin.'); }} className="text-[10px] font-bold text-muted-foreground underline decoration-border underline-offset-4 hover:text-destructive">Clear sheet</button>}</div>
                </div>
                {records.length === 0 ? <EmptyWorkspace onLoad={loadSampleData} onUpload={() => fileInputRef.current?.click()} /> : filteredRecords.length ? <div className="divide-y divide-border/70">
                  {filteredRecords.map((record, index) => <RecordRow key={record.id} record={record} selected={selected.includes(record.id)} index={index} onToggle={() => toggleSelected(record.id)} onUpdate={updateRecord} />)}
                </div> : <EmptySearch query={query} onClear={() => { setQuery(''); setFilter('all'); }} />}
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                <div className="flex items-start justify-between"><div><h2 className="font-display text-xl font-bold tracking-tight">Message</h2></div><div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-foreground"><Sparkles size={17} /></div></div>
                <textarea data-testid="textarea-message-template" value={template} onChange={(event) => setTemplate(event.target.value)} rows={5} className="mt-4 w-full resize-none rounded-xl border border-border bg-[#fbf8f1] p-3 text-xs leading-5 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/15" />
                <div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-md bg-muted px-2 py-1 font-mono-app text-[10px] text-muted-foreground">{'{{DriverName}}'}</span><span className="rounded-md bg-muted px-2 py-1 font-mono-app text-[10px] text-muted-foreground">{'{{Pending Duty Count}}'}</span></div>
                <button data-testid="button-apply-template" onClick={applyTemplate} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2.5 text-xs font-bold text-secondary-foreground transition hover:-translate-y-0.5 hover:shadow-sm"><RefreshCw size={14} /> Apply to {selected.length ? 'selected' : 'all drivers'}</button>
              </div>
              <ActivityCard activity={activity} counts={counts} />
            </aside>
          </section>
        </div>
      </main>

      <button data-testid="button-prepare-send" aria-label={phoneNumberId ? 'Send selected messages' : 'Open WhatsApp setup'} title={phoneNumberId ? 'Send selected messages' : 'Open WhatsApp setup'} onClick={prepareSend} className="fixed bottom-6 right-6 z-30 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:-translate-y-0.5 hover:bg-primary/90"><Send size={18} /></button>

      {setupOpen && <SetupModal phoneNumberId={phoneNumberId} onSave={(value) => { setPhoneNumberId(value); localStorage.setItem('whatsapp-phone-number-id', value); setSetupOpen(false); setActivity('WhatsApp phone number ID saved. Select ready drivers to send.'); }} onClose={() => setSetupOpen(false)} />}
    </div>
  );
}

function StatCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: ReactNode; tone: string }) {
  const tones: Record<string, string> = { cream: 'bg-card', teal: 'bg-[#dff1ed]', yellow: 'bg-[#fff0bc]', rose: 'bg-[#f9e6e0]' };
  return <div data-testid={`stat-card-${label.toLowerCase().replaceAll(' ', '-')}`} className={`rounded-2xl border border-border p-4 shadow-xs ${tones[tone]}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{label}</span><span className="text-primary/60">{icon}</span></div><div className="mt-3 font-display text-3xl font-bold tracking-tight text-primary">{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{detail}</div></div>;
}

function StatusPill({ status, id }: { status: DeliveryStatus; id: string }) {
  const styles = { ready: 'bg-[#dff1ed] text-[#246b5e]', pending: 'bg-[#fff0bc] text-[#7e6215]', blocked: 'bg-[#f9e6e0] text-[#a84a3d]', sent: 'bg-[#dce8fa] text-[#2b5a9a]', delivered: 'bg-[#dff1ed] text-[#246b5e]', read: 'bg-[#dff1ed] text-[#246b5e]', failed: 'bg-[#f9e6e0] text-[#a84a3d]' };
  const labels = { ready: 'Ready', pending: 'Draft needed', blocked: 'Blocked', sent: 'Accepted', delivered: 'Delivered', read: 'Read', failed: 'Failed' };
  const icons = { ready: <Check size={12} />, pending: <Pencil size={12} />, blocked: <XCircle size={12} />, sent: <CheckCircle2 size={12} />, delivered: <CheckCircle2 size={12} />, read: <CheckCircle2 size={12} />, failed: <XCircle size={12} /> };
  return <span data-testid={`status-record-${id}`} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono-app text-[10px] font-medium ${styles[status]}`}>{icons[status]} {labels[status]}</span>;
}

function RecordRow({ record, selected, index, onToggle, onUpdate }: { record: DriverRecord; selected: boolean; index: number; onToggle: () => void; onUpdate: (id: string, patch: Partial<DriverRecord>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(record.message);
  function save() { onUpdate(record.id, { message: draft }); setEditing(false); }
  return <div data-testid={`row-driver-${record.id}`} className={`rise-in grid gap-3 px-4 py-4 transition-colors md:grid-cols-[28px_1.1fr_.75fr_2fr_112px] md:items-center ${selected ? 'bg-[#fffbef]' : 'hover:bg-muted/35'}`} style={{ animationDelay: `${index * 18}ms` }}>
    <input data-testid={`checkbox-driver-${record.id}`} aria-label={`Select ${record.driver}`} type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 accent-[#18363a]" />
    <div className="flex min-w-0 items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent font-mono-app text-[10px] font-medium text-accent-foreground">{record.driver.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div className="min-w-0"><p data-testid={`text-driver-${record.id}`} className="truncate text-sm font-bold">{record.driver || 'Unnamed driver'}</p><p className="mt-0.5 font-mono-app text-[10px] text-muted-foreground">{record.vehicle}</p></div></div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground md:block"><span className="md:hidden">Pending duties</span><span data-testid={`text-duties-${record.id}`} className="font-mono-app font-medium text-foreground">{record.duties}</span></div>
    <div className="min-w-0">
      {editing ? <div className="space-y-2"><textarea data-testid={`textarea-message-${record.id}`} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} className="w-full resize-none rounded-lg border border-ring bg-card px-2.5 py-2 text-xs leading-5 outline-none" /><div className="flex gap-2"><button data-testid={`button-save-message-${record.id}`} onClick={save} className="rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-bold text-primary-foreground">Save message</button><button data-testid={`button-cancel-message-${record.id}`} onClick={() => { setDraft(record.message); setEditing(false); }} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground hover:bg-muted">Cancel</button></div></div> : <button data-testid={`button-edit-message-${record.id}`} onClick={() => setEditing(true)} className="group block w-full text-left"><p className={`line-clamp-2 text-xs leading-5 ${record.message ? 'text-foreground/75' : 'italic text-muted-foreground'}`}>{record.message || 'Add a message before reviewing this driver.'}</p><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-primary opacity-60 transition group-hover:opacity-100"><Pencil size={10} /> Edit message</span></button>}
    </div>
    <div className="flex items-center justify-between gap-3 md:block"><div className="font-mono-app text-[10px] text-muted-foreground">{record.mobile || 'Mobile number missing'}</div><StatusPill id={record.id} status={record.status} /></div>
  </div>;
}

function ActivityCard({ activity, counts }: { activity: string; counts: { pending: number; ready: number; blocked: number } }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-xs"><div className="flex items-center justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">Activity</p><h2 className="mt-2 font-display text-xl font-bold tracking-tight">Queue health</h2></div><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#dff1ed] text-[#246b5e]"><Info size={17} /></div></div><p data-testid="status-activity" className="mt-4 rounded-xl bg-muted/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">{activity}</p><div className="mt-5 space-y-3"><ActivityLine label="Ready for review" count={counts.ready} color="bg-[#3d9b7b]" /><ActivityLine label="Draft message needed" count={counts.pending} color="bg-[#d3a92e]" /><ActivityLine label="Mobile number missing" count={counts.blocked} color="bg-[#d96a58]" /></div></div>;
}

function ActivityLine({ label, count, color }: { label: string; count: number; color: string }) {
  return <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2.5 text-muted-foreground"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span><span data-testid={`text-activity-count-${label.toLowerCase().replaceAll(' ', '-')}`} className="font-mono-app font-medium text-foreground">{count}</span></div>;
}

function EmptySearch({ query, onClear }: { query: string; onClear: () => void }) {
  return <div className="flex min-h-[255px] flex-col items-center justify-center px-6 text-center"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><Search size={20} /></div><h3 className="mt-4 font-display text-lg font-bold">No drivers match this view</h3><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{query ? `Nothing matched “${query}”. Try another name or vehicle number.` : 'There are no records in this status yet.'}</p><button data-testid="button-clear-filters" onClick={onClear} className="mt-4 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Clear filters</button></div>;
}

function EmptyWorkspace({ onLoad, onUpload }: { onLoad: () => void; onUpload: () => void }) {
  return <div data-testid="empty-workspace" className="flex min-h-[310px] flex-col items-center justify-center px-6 text-center"><div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-[#fff0bc] text-primary"><FileSpreadsheet size={24} /><span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#dff1ed] text-[#246b5e]"><CloudUpload size={12} /></span></div><h3 className="mt-5 font-display text-xl font-bold">Your duty sheet starts here</h3><p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Bring in the daily Excel or CSV export, or take a quick turn with sample data before your first live sheet.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button data-testid="button-empty-load-sample" onClick={onLoad} className="inline-flex items-center gap-2 rounded-xl bg-secondary px-3.5 py-2.5 text-xs font-bold text-secondary-foreground transition hover:-translate-y-0.5"><FileSpreadsheet size={14} /> Use sample data</button><button data-testid="button-empty-upload" onClick={onUpload} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-bold transition hover:bg-muted"><Upload size={14} /> Choose a file</button></div><p className="mt-4 font-mono-app text-[10px] text-muted-foreground">.xlsx · .xls · .csv</p></div>;
}

function SetupModal({ phoneNumberId, onSave, onClose }: { phoneNumberId: string; onSave: (value: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(phoneNumberId);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" data-testid="dialog-connection-setup" className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#dff1ed] text-[#246b5e]"><Link2 size={21} /></div><button data-testid="button-close-setup" onClick={onClose} aria-label="Close setup" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X size={18} /></button></div><p className="mt-5 font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">Connection settings</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Connect WhatsApp Business</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Your WhatsApp account is connected securely. Add the phone number ID from Meta Business Manager so Relaydesk knows which business number should send these messages.</p><label className="mt-5 block text-xs font-bold text-foreground" htmlFor="whatsapp-phone-number-id">WhatsApp phone number ID</label><input id="whatsapp-phone-number-id" data-testid="input-whatsapp-phone-number-id" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Example: 123456789012345" className="mt-2 h-11 w-full rounded-xl border border-border bg-[#fbf8f1] px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" /><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Find it in Meta Business Manager → WhatsApp → API setup. This is not the public phone number.</p><div className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-[#fff9e7] p-3 text-[11px] leading-5 text-muted-foreground"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#7e6215]" /> Messages are sent through the connected WhatsApp Business service. The access token is never stored in this browser.</div><div className="mt-5 flex gap-2"><button data-testid="button-save-setup" disabled={!draft.trim()} onClick={() => onSave(draft.trim())} className="flex-1 rounded-xl bg-primary py-3 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Save and enable sending</button><button data-testid="button-close-setup-done" onClick={onClose} className="rounded-xl border border-border px-4 py-3 text-xs font-bold text-muted-foreground">Cancel</button></div></div></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={AppShell} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function RootApp() {
  return <AuthGate><QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider></AuthGate>;
}

export default RootApp;
