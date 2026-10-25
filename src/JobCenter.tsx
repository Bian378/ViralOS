import { useEffect, useRef, useState } from 'react';
import { api } from '@appdeploy/client';
import { Activity, ArrowRight, Check, Clock, Pause, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { terminal, type QueueJob } from './queue-model';

type PublicJob = Omit<QueueJob, 'owner' | 'lease' | 'slot'>;
type QueueData = { stopped: boolean; jobs: PublicJob[]; heartbeat: string | null; intervalMinutes: number; workerErrors: number };
type Request = {
  requestId: string; kind: string; source: string; scheduledAt: number; priority: number; acceptUnknownCost: boolean;
};
const labels: Record<string, string> = {
  queued: 'Köad', running: 'Bearbetas', waiting: 'Väntar', retry: 'Nytt försök planerat',
  complete: 'Klar', cancelled: 'Avbruten', failed: 'Misslyckad', needs_review: 'Behöver granskas'
};
function message(e: unknown) {
  const err = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return err.response?.data?.error || err.response?.data?.message || err.message || 'Förfrågan misslyckades.';
}
function date(value: string | number) {
  return new Date(value).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });
}
export default function JobCenter({ userId, aiEnabled, youtube, onChange, onOpenProject }: {
  userId: string; aiEnabled: boolean; youtube: boolean; onChange: () => Promise<void>; onOpenProject: (id: string) => void;
}) {
  const [data, setData] = useState<QueueData>({ stopped: false, jobs: [], heartbeat: null, intervalMinutes: 5, workerErrors: 0 });
  const [kind, setKind] = useState('collect');
  const [source, setSource] = useState(youtube ? 'youtube' : 'hn');
  const [start, setStart] = useState('');
  const [priority, setPriority] = useState(0);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const storageKey = 'viralos-queue-request-' + userId;
  const pending = useRef<Request | null>(null);
  const signature = useRef('');
  async function load() {
    const result = await api.get('/api/queue');
    setData(result.data);
    const nextSignature = result.data.jobs.map((j: PublicJob) => j.id + ':' + j.status).join('|');
    if (signature.current && signature.current !== nextSignature) await onChange();
    signature.current = nextSignature;
  }
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        pending.current = JSON.parse(saved);
        setNotice('En tidigare förfrågan saknar bekräftelse. Nästa klick kontrollerar samma uppgift.');
      }
    } catch { setError('Kunde inte läsa tidigare förfrågan i den här fliken.'); }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try { if (active) await load(); } catch (e) { if (active) setError(message(e)); }
      if (active) timer = setTimeout(refresh, 15000);
    }
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [userId]);
  async function action(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); await load(); await onChange(); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function enqueue() {
    if (!pending.current) {
      if (kind === 'pipeline' && (!aiEnabled || !consent)) {
        setError('Aktivera AI-provning i Inställningar och godkänn ett AI-anrop för denna uppgift.'); return;
      }
      const scheduledAt = start ? Date.parse(start) : Date.now();
      if (!Number.isFinite(scheduledAt) || (start && scheduledAt < Date.now()) || scheduledAt > Date.now() + 7 * 86400000) {
        setError('Välj en framtida starttid inom sju dagar eller lämna fältet tomt.'); return;
      }
      pending.current = { requestId: crypto.randomUUID(), kind, source, scheduledAt, priority, acceptUnknownCost: consent && kind === 'pipeline' };
      try { sessionStorage.setItem(storageKey, JSON.stringify(pending.current)); }
      catch { pending.current = null; setError('Tillåt sessionslagring så att förfrågan kan skyddas mot dubbelkörning.'); return; }
    }
    await action(async () => {
      await api.post('/api/queue', pending.current);
      pending.current = null; sessionStorage.removeItem(storageKey);
      setConsent(false); setNotice('Uppgiften är sparad på servern. Du kan stänga fliken.');
    });
  }
  const running = data.jobs.filter(j => j.status === 'running').length;
  const waiting = data.jobs.filter(j => !terminal(j.status) && j.status !== 'running').length;
  return <>
    <div className="page-head">
      <div><div className="eyebrow">SERVERKÖ / SPÅRBARA UPPGIFTER</div><h1>Kontrollerad uppgiftskö.</h1><p>Den separata kön för beställda jobb är pausad under kvalitetssäkringen. Timvis YouTube-radar kan aktiveras separat under Trendradar. Du kan fortfarande granska, avbryta eller uttryckligen testköra ett jobb.</p></div>
      <div className="actions">
        <button disabled={busy} onClick={() => action(load)}><RefreshCw size={14} style={{ display: 'inline' }} /> Uppdatera kö</button>
        <button className={data.stopped ? 'primary' : 'danger'} disabled={busy} onClick={() => action(async () => {
          await api.post('/api/queue/control', { stopped: !data.stopped });
        })}>{data.stopped ? <Play size={13} style={{ display: 'inline' }} /> : <Pause size={13} style={{ display: 'inline' }} />} {data.stopped ? 'Återuppta kön' : 'Stoppa kön'}</button>
      </div>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <div className="notice amber">Kvalitetssäkring pågår. Schemalagda beställningsjobb är pausade. Automatisk YouTube-radar är en separat opt-in-funktion under Trendradar. Kör nu startar däremot uttryckligen det valda jobbet. MP4-rendering och publicering ingår inte i bakgrundskön.</div>
    <div className="metrics">
      <div className="metric"><div className="metric-top">Pågående <Activity /></div><div className="metric-number">{running}</div><small>Registrerade serverjobb</small></div>
      <div className="metric"><div className="metric-top">Väntande <Clock /></div><div className="metric-number">{waiting}</div><small>Inklusive schemalagda och pausade</small></div>
      <div className="metric"><div className="metric-top">Klara <Check /></div><div className="metric-number">{data.jobs.filter(j => j.status === 'complete').length}</div><small>Bland de senaste 40 uppgifterna</small></div>
      <div className="metric"><div className="metric-top">Serverstatus <ShieldCheck /></div><div className="metric-number" style={{ fontSize: 19 }}>{data.stopped ? 'Kön stoppad' : data.heartbeat ? 'Senast körd' : 'Inväntar körning'}</div><small>{data.heartbeat ? date(data.heartbeat) : 'Ingen schemalagd körning bekräftad ännu'}</small></div>
    </div>
    <div className="columns">
      <div className="panel">
        <div className="panel-header"><h2>Uppgifter & resultat</h2><span className="badge">{data.jobs.length} sparade</span></div>
        {data.jobs.length === 0 ? <div className="empty"><Clock size={28} /><h3>Kön är tom</h3><p>Börja med en datainsamling. Den behöver inget godkännande för AI-krediter.</p></div> :
          data.jobs.map(job => <div className="feed-row" key={job.id}>
            <div className="feed-meta"><span className={'badge ' + (job.status === 'complete' ? 'green' : ['failed', 'needs_review'].includes(job.status) ? 'amber' : '')}>{labels[job.status]}</span><small>{date(job.createdAt)}</small></div>
            <h3>{job.kind === 'pipeline' ? 'Källsignal → AI-manus' : 'Datainsamling'} · {job.source === 'hn' ? 'Hacker News' : 'YouTube'}</h3>
            <p className="smallprint">{job.message}</p>
            <p className="smallprint">Steg: {job.stage === 'collect' ? 'Källinsamling' : 'Manus'} · Tidigast {date(job.scheduledAt)}{job.attempts > 0 ? ' · Misslyckade hämtningar: ' + job.attempts : ''}</p>
            <div className="actions">
              {job.projectId && <button className="primary small" onClick={() => onOpenProject(job.projectId!)}>Öppna manus <ArrowRight size={12} style={{ display: 'inline' }} /></button>}
              {!terminal(job.status) && job.status !== 'running' && <>
                <button className="small" disabled={busy || data.stopped} onClick={() => action(async () => { await api.post('/api/queue/' + job.id + '/run', {}); })}>Kör nu</button>
                <button className="small ghost" disabled={busy} onClick={() => action(async () => { await api.post('/api/queue/' + job.id + '/cancel', {}); })}>Avbryt uppgift</button>
              </>}
              {job.status === 'running' && <span className="smallprint">Körningen håller ett tidsbegränsat lås.</span>}
            </div>
          </div>)}
      </div>
      <div className="panel">
        <div className="panel-header"><h2>Ny bakgrundsuppgift</h2><span className="badge">Max 3 aktiva</span></div>
        <div className="panel-body">
          <label>Arbetsflöde<select value={kind} onChange={e => setKind(e.target.value)} disabled={busy || Boolean(pending.current)}>
            <option value="collect">Samla källsignaler</option><option value="pipeline">Samla signaler och skapa ett AI-manus</option>
          </select></label>
          <label>Datakälla<select value={source} onChange={e => setSource(e.target.value)} disabled={busy || Boolean(pending.current)}>
            <option value="hn">Hacker News – tekniksignaler</option><option value="youtube" disabled={!youtube}>YouTube{youtube ? '' : ' – ej anslutet'}</option>
          </select></label>
          <label>Tidigaste start (din enhets tidszon)<input type="datetime-local" value={start} disabled={busy || Boolean(pending.current)} onChange={e => setStart(e.target.value)} /></label>
          <p className="smallprint">Lämna tomt för nästa serverkörning. Starttiden är en tidigaste tid, inte en exakt leveranstid.</p>
          <label>Prioritet<select value={priority} disabled={busy || Boolean(pending.current)} onChange={e => setPriority(Number(e.target.value))}><option value={0}>Normal</option><option value={1}>Hög</option></select></label>
          {kind === 'pipeline' && <>
            <div className="notice amber">Ett AI-anrop väljer en aktuell källsignal och skapar ett originalutkast. Urvalet är inte en prognos om viralitet. Kreditkostnaden är okänd och ligger utanför eurobudgeten.</div>
            <label className="check"><input type="checkbox" checked={consent} disabled={busy || Boolean(pending.current)} onChange={e => setConsent(e.target.checked)} />Jag godkänner ett AI-anrop för denna uppgift till okänd kostnad i leverantörskrediter.</label>
            {!aiEnabled && <p className="smallprint">Aktivera först manuell AI-provning under Inställningar.</p>}
          </>}
          <button className="primary" disabled={busy || data.stopped} onClick={enqueue}>{busy ? 'Sparar / bearbetar…' : pending.current ? 'Kontrollera samma förfrågan' : 'Lägg i kö'}</button>
          <p className="smallprint">Kön sparas på servern. Dina uppgifter är bara åtkomliga med ditt konto. Avbrutna kvitton sparas för att förhindra oavsiktliga omkörningar.</p>
        </div>
      </div>
    </div>
  </>;
}
