import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react';
import type { Project, State } from './model';
import type { QueueJob } from './queue-model';
import { terminal } from './queue-model';
import { reviewStatus, revisionOf, type ScriptReview } from './review';
import PipelineOverview from './PipelineOverview';

type QueueView = { stopped: boolean; jobs: QueueJob[]; heartbeat: string | null };
type Decision = ScriptReview['decision'];
const labels = {
  pending: 'Väntar på granskning', approved_script: 'Manus godkänt',
  needs_changes: 'Ändringar begärda', revoked: 'Godkännande återkallat',
};
const date = (value: string) => new Date(value).toLocaleString('sv-SE', {
  timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short',
});
function failure(e: unknown) {
  const err = e as { response?: { data?: { error?: string } }; message?: string };
  return err.response?.data?.error || err.message || 'Kunde inte läsa kön.';
}

function ReviewCard({ project, busy, onOpen, onReview }: {
  project: Project; busy: boolean; onOpen: (p: Project) => void;
  onReview: (p: Project, decision: Decision, comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [checked, setChecked] = useState(false);
  const status = reviewStatus(project);
  return <details className="review-card">
    <summary><span><strong>{project.title}</strong><small>Version {revisionOf(project)} · {date(project.updatedAt)}</small></span>
      <span className={'badge ' + (status === 'approved_script' ? 'green' : 'amber')}>{labels[status]}</span></summary>
    <div className="review-body">
      <p className="script-preview">{project.script}</p>
      {project.sourceUrl && <a href={project.sourceUrl} target="_blank" rel="noreferrer">Öppna källan ↗</a>}
      {project.review && <p className="smallprint">Senaste beslut: {date(project.review.at)}{project.review.comment ? ' · ' + project.review.comment : ''}</p>}
      <label>Kommentar inför nästa beslut<textarea maxLength={1000} rows={2} value={comment} onChange={e => setComment(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
        Jag har läst denna manusversion. Mitt beslut gäller endast manuset.</label>
      <div className="actions">
        <button className="primary small" disabled={busy || !checked || status === 'approved_script'} onClick={() => onReview(project, 'approved_script', comment)}>Godkänn manus</button>
        <button className="small" disabled={busy || !checked || !comment.trim()} onClick={() => onReview(project, 'needs_changes', comment)}>Begär ändringar</button>
        {status === 'approved_script' && <button className="small danger" disabled={busy || !checked} onClick={() => onReview(project, 'revoked', comment)}>Återkalla</button>}
        <button className="small ghost" onClick={() => onOpen(project)}>Redigera manus →</button>
      </div>
    </div>
  </details>;
}

export default function Dashboard({ state, youtube, busy, onNavigate, onOpen, onNew, onCollect, onRefresh, onProfile, onReview }: {
  state: State; youtube: boolean; busy: boolean;
  onNavigate: (page: string) => void; onOpen: (p: Project) => void;
  onNew: () => void; onCollect: () => void; onRefresh: () => Promise<void>;
  onProfile: () => void; onReview: (p: Project, decision: Decision, comment: string) => Promise<void>;
}) {
  const [queue, setQueue] = useState<QueueView | null>(null);
  const [queueError, setQueueError] = useState('');
  const [queueBusy, setQueueBusy] = useState(false);
  const [readAt, setReadAt] = useState('');
  useEffect(() => {
    let active = true;
    api.get('/api/queue').then(result => {
      if (active) { setQueue(result.data); setReadAt(new Date().toISOString()); }
    }).catch(e => { if (active) setQueueError(failure(e)); });
    return () => { active = false; };
  }, []);
  async function refresh(stop = false) {
    setQueueBusy(true); setQueueError('');
    try {
      if (stop) await api.post('/api/queue/control', { stopped: true });
      const result = await api.get('/api/queue');
      setQueue(result.data); setReadAt(new Date().toISOString());
      await onRefresh();
    } catch (e) { setQueueError(failure(e)); }
    finally { setQueueBusy(false); }
  }
  const pending = state.projects.filter(p => reviewStatus(p) !== 'approved_script');
  const approved = state.projects.length - pending.length;
  const activeJobs = queue?.jobs.filter(j => !terminal(j.status));
  const attention = queue?.jobs.filter(j => ['failed', 'needs_review'].includes(j.status));
  const social = state.trends.filter(t => t.source === 'YouTube');
  const disabled = busy || queueBusy;
  return <>
    <div className="page-head">
      <div><div className="eyebrow">YOUTUBE SHORTS / DIN KONTROLLPANEL</div><h1>Du bestämmer nästa steg.</h1>
        <p>Från källunderlag till granskning. Beställningskön är pausad under kvalitetssäkringen. YouTube-radarn är ett separat, frivilligt timschema.</p></div>
      <div className="actions"><button disabled={disabled} onClick={() => refresh()}>Uppdatera status</button><button onClick={onNew}>Nytt manus</button></div>
    </div>
    <div className="control-banner"><ShieldCheck size={24} /><div><strong>Publicering är blockerad</strong>
      <p>Ett manusgodkännande tillåter varken betald produktion eller uppladdning. Färdig video och publicering kräver egna beslut.</p></div>
      <button className="danger" disabled={disabled || !queue || queue.stopped || !!queueError} onClick={() => refresh(true)}>{queue?.stopped ? 'Kön är stoppad' : 'Stoppa bakgrundskön'}</button></div>
    <p className="smallprint">Beställningsköns schemaläggning är pausad under systemtest; automatisk YouTube-trendhämtning har egen av/på-inställning i Trendradar. Manuellt Kör nu i Bakgrundsjobb är fortfarande möjligt. Stopp hindrar nya kösteg. Ett redan skickat anrop kan slutföras. {readAt ? 'Köstatus läst ' + date(readAt) + ' (Madrid).' : 'Läser köstatus…'}</p>
    {queueError && <div className="notice error" role="alert">Köstatus kan vara inaktuell: {queueError} <button disabled={disabled} onClick={() => refresh()}>Försök igen</button></div>}
    <div className="metrics">
      {[
        { label: 'Manus att granska', value: pending.length, sub: 'Inklusive begärda ändringar', page: 'reviews' },
        { label: 'Aktiva köjobb', value: queueError ? '—' : activeJobs?.length ?? '—', sub: 'Köade, väntande och körande', page: 'jobs' },
        { label: 'Jobb att kontrollera', value: queueError ? '—' : attention?.length ?? '—', sub: 'Fel eller osäkert resultat', page: 'jobs' },
        { label: 'YouTube-signaler', value: social.length, sub: 'Hämtat urval; Shorts ej verifierat', page: 'radar' },
      ].map(m => <button className="metric metric-link" key={m.label} onClick={() => m.page === 'reviews' ? document.getElementById('review-inbox')?.scrollIntoView({ behavior: 'smooth' }) : onNavigate(m.page)}>
        <span className="metric-top">{m.label}<ArrowRight size={16} /></span><span className="metric-number">{m.value}</span><small>{m.sub}</small></button>)}
    </div>
    <PipelineOverview projects={state.projects} onOpenProject={onOpen} onNavigate={onNavigate} />
    <div className="columns dashboard-columns">
      <section className="panel" id="review-inbox">
        <div className="panel-header"><h2>Din granskningsinkorg</h2><span className="badge">{approved} manus godkända</span></div>
        <p className="panel-body smallprint">Läs den sparade versionen innan du beslutar. Ändringar i titel, manus eller källa kräver ny granskning.</p>
        {state.projects.length ? state.projects.map(p => <ReviewCard key={p.id + ':' + revisionOf(p) + ':' + (p.review?.id || '')} project={p} busy={busy} onOpen={onOpen} onReview={onReview} />)
          : <div className="empty"><h3>Första manuset börjar med en idé</h3><p>Hämta YouTube-underlag eller skriv ett eget engelskt manus.</p><button disabled={disabled || !youtube} onClick={onCollect}>Hämta YouTube-signaler</button><button className="ghost" onClick={onNew}>Skriv ett manus</button></div>}
      </section>
      <details className="dashboard-details"><summary>Fler detaljer <span>Trendlabb · Produktionsprofil · Nästa steg · Budget</span></summary>
      <div className="dashboard-stack">
        <section className="panel"><div className="panel-header"><h2>Trendlabb</h2><span className="badge">{state.candidates?.length || 0} sparade</span></div><div className="panel-body"><p>Spara källor, sortera videosignaler och förbered manusidéer.</p><button className="small" onClick={() => onNavigate('trend-lab')}>Öppna Trendlabbet →</button><p className="smallprint">Manuell research utan AI-anrop.</p></div></section>
        <section className="panel"><div className="panel-header"><h2>Produktionsprofil</h2><span className="badge">YouTube Shorts</span></div><div className="panel-body">
          <p>Sociala trender · 9:16 · mål 15–45 sekunder</p>
          <p>Manusspråk: <strong>{state.settings.language === 'en' ? 'English' : 'Svenska'}</strong> · region {state.settings.region}</p>
          {state.settings.language !== 'en' || state.settings.contentFocus !== 'social-trends' ? <button disabled={busy} onClick={onProfile}>Använd sociala trender + English</button> : <span className="badge green">Sociala trender + English sparat</span>}
          <p className="smallprint">Mål: engelsk titel, röst och text. Egen eller licensierad röstfil kan nu kodas till AAC i MP4; automatisk AI-röst återstår.</p>
        </div></section>
        <section className="panel"><div className="panel-header"><h2>Det här återstår</h2><Activity size={18} /></div><div className="panel-body readiness-list">
          <div><strong>1. Källunderlag</strong><p>{youtube ? 'YouTube-nyckel finns. Verifiera med en hämtning.' : 'YouTube-nyckel saknas.'} Urvalet bevisar inte att en video är en Short.</p><button className="small" disabled={disabled || !youtube} onClick={onCollect}>Hämta YouTube-signaler</button></div>
          <div><strong>2. Färdig film</strong><p>Videostudion skapar nu två motion-grafikstilar med preliminära undertexter och valfri rättighetskontrollerad ljudfil. Automatisk AI-röst och talstyrd textjustering återstår.</p><button className="small" onClick={() => onNavigate('studio')}>Öppna studion</button></div>
          <div><strong>3. Publicering</strong><p>OAuth, exakt videogodkännande och separat publiceringstillstånd återstår. Inga videor laddas upp.</p><button className="small" onClick={() => onNavigate('calendar')}>Se publiceringsstegen</button></div>
        </div></section>
        <section className="panel"><div className="panel-header"><h2>Kostnadskontroll</h2></div><div className="panel-body">
          <p>Sparad ram: {state.settings.dailyBudget} €/dag · {state.settings.monthlyBudget} €/månad</p>
          <p className="smallprint">Verklig förbrukning i euro är inte ansluten. AI-provning är {state.settings.aiTrial ? 'aktiverad, med separat bekräftelse per uppgift' : 'avstängd'} och räknas i leverantörskrediter till okänd kostnad.</p>
          <button className="small" onClick={() => onNavigate('settings')}>Hantera budget och samtycke</button>
        </div></section>
      </div></details>
    </div>
    <details className="dashboard-details" style={{ marginTop: 22 }}><summary>Chefens statusunderlag <span>Händelser och agenternas arbetslogg</span></summary>
    <section className="panel" style={{ marginTop: 12 }}><div className="panel-header"><h2>Chefens statusunderlag</h2><button className="small ghost" onClick={() => onNavigate('agents')}>Se 1 chef + 9 specialister →</button></div><div className="panel-body">
      <p className="smallprint">Sammanställning av sparade händelser. Automatisk agentdelegering återstår.</p>
      {state.events.length ? state.events.slice(0, 6).map((event, i) => <div className="log-row" key={event.at + i}><small>{date(event.at)}</small>{event.text}</div>) : <p>Inga genomförda händelser ännu.</p>}
    </div></section></details>
  </>;
}
