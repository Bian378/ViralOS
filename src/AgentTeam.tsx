import { useState } from 'react';
import { Activity, Bot, ExternalLink, ShieldCheck } from 'lucide-react';
import { productTeam } from './team';
import type { ManagerPlan } from './manager';
import type { Trend, Project } from './model';
import { revisionOf } from './review';
import type { EditorialRun } from './editorial';

type Props = {
  plans: ManagerPlan[]; trends: Trend[]; paused: string[]; busy: boolean;
  runs: EditorialRun[]; projects: Project[]; onOpenProject: (project: Project) => void;
  aiEnabled: boolean; onNavigate: (page: string) => void;
  onPause: (id: string, paused: boolean) => void;
  onCollect: () => void; onPlan: () => void;
  onSelect: (planId: string, trendId: string) => void;
  onManual: (source: Pick<Trend, 'title' | 'url'>) => void; onAi: (trend: Trend) => void;
};
const fmt = (n: number) => new Intl.NumberFormat('sv-SE').format(n);
const date = (s: string) => new Date(s).toLocaleString('sv-SE', {
  timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short',
});
const statusText = { done: 'Klar', review: 'Kräver kontroll', waiting: 'Väntar' };

export default function AgentTeam({
  plans, trends, paused, busy, aiEnabled, onNavigate, onPause,
  runs, projects, onOpenProject,
  onCollect, onPlan, onSelect, onManual, onAi,
}: Props) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const plan = plans.find(p => p.id === selectedPlanId) || plans[0];
  const blocked = paused.includes('youtube') || paused.includes('intelligence');
  return <>
    <div className="page-head">
      <div>
        <div className="eyebrow">FAS 2 / CHEFSAGENT</div>
        <h1>Från trend till manusidé</h1>
        <p>Chefsagenten samlar beslutsunderlag från befintliga YouTube-signaler och väntar på ditt val.</p>
      </div>
      <span className="badge">1 chef · 9 specialister</span>
    </div>
    <div className="notice amber">
      Första chefsflödet är regelstyrt, inte tio autonoma AI-modeller.
      Inga AI-krediter, videor eller uppladdningar startas automatiskt.
      Källvideo, fakta och rättigheter måste kontrolleras innan innehållet får användas.
    </div>
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-header">
        <h2>1. Skapa plan</h2>
        <span className="badge">{trends.filter(t => t.source === 'YouTube').length} YouTube-signaler</span>
      </div>
      <div className="panel-body">
        <p>Planeringen läser de senaste sju dagarnas sparade observationer, väljer högst tre idéer och dokumenterar begränsningarna.</p>
        <div className="actions">
          <button className="primary" disabled={busy || blocked} onClick={onPlan}>
            <Bot size={15} style={{ display: 'inline', marginRight: 6 }} />
            {busy ? 'Skapar plan…' : 'Skapa researchplan'}
          </button>
          <button disabled={busy} onClick={onCollect}>Hämta YouTube-signaler</button>
        </div>
        {blocked && <p className="smallprint">YouTube Discovery eller Trend Intelligence är pausad. Återuppta under Agentroller nedan.</p>}
        <p className="smallprint">En plan använder bara redan insamlade data. Saknas färska signaler behöver du först hämta nya.</p>
      </div>
    </section>
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-header"><h2>2. Beslutsunderlag</h2><span className="badge">{plans.length} sparade planer</span></div>
      {!plan ? <div className="empty"><Activity size={28} /><h3>Ingen plan ännu</h3>
        <p>Klicka på Skapa researchplan för att testa chefsagentens samordning.</p></div> : <>
        <div className="panel-body">
          <div className="feed-meta"><span className={'badge ' + (plan.status === 'selected' ? 'green' : 'amber')}>
            {plan.status === 'selected' ? 'Idé vald' : 'Väntar på ditt val'}
          </span><small>{date(plan.createdAt)}</small></div>
          {plans.length > 1 && <label style={{ marginTop: 14 }}>Sparade planer
            <select value={plan.id} onChange={e => setSelectedPlanId(e.target.value)}>
              {plans.map(p => <option key={p.id} value={p.id}>{date(p.createdAt)} · {p.status === 'selected' ? 'Vald' : 'Inväntar val'}</option>)}
            </select>
          </label>}
          <div className="manager-steps">
            {plan.steps.map((step, index) => <div className="manager-step" key={step.role}>
              <span className={'badge ' + (step.status === 'done' ? 'green' : 'amber')}>
                {index + 1} · {statusText[step.status]}
              </span>
              <strong>{step.role}</strong>
              <p className="smallprint">{step.detail}</p>
            </div>)}
          </div>
        </div>
        <div className="panel-header"><h2>3. Välj en idé</h2><span className="badge">Beslut kräver ditt klick</span></div>
        {plan.candidates.map((idea, index) => {
          const trend = trends.find(t => t.id === idea.trendId);
          const selected = plan.selectedTrendId === idea.trendId;
          return <div className="feed-row" key={idea.trendId}>
            <div className="feed-meta">
              <span className={'badge ' + (selected ? 'green' : '')}>Alternativ {index + 1}{selected ? ' · Ditt val' : ''}</span>
              <small>Observerad {date(idea.observedAt)}</small>
            </div>
            <h3>{idea.title}</h3>
            <p className="smallprint">{fmt(idea.views)} totala visningar · Publicerad {date(idea.publishedAt)}</p>
            <p className="smallprint">{idea.reason}</p>
            <div className="actions" style={{ flexWrap: 'wrap' }}>
              <a className="manager-link" href={idea.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} /> Öppna källan
              </a>
              {plan.status === 'awaiting_selection' && <button className="small primary" disabled={busy}
                onClick={() => onSelect(plan.id, idea.trendId)}>Välj denna idé</button>}
              {selected && <>
                <button className="small primary"
                  onClick={() => onManual({ title: idea.title, url: idea.url })}>
                  Skriv originalmanus →
                </button>
                {trend && <button className="small" disabled={busy} onClick={() => onAi(trend)}>
                  AI-manus (kräver godkännande)
                </button>}
                {!trend && <span className="smallprint">
                  Källan finns kvar i planen, men inte längre i aktuell trendlista.
                  Manuellt manus är tillgängligt; AI-manus kräver ny insamling.
                </span>}
                {trend && !aiEnabled && <span className="smallprint">AI-provning är avstängd under Inställningar.</span>}
              </>}
            </div>
          </div>;
        })}
      </>}
    </section>
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-header"><h2>Samordnade manusgranskningar</h2>
        <span className="badge">{runs.filter(r => projects.some(p => p.id === r.projectId && revisionOf(p) === r.revision)).length} aktuella</span>
      </div>
      <div className="panel-body">
        <p className="smallprint">Creative Director, Research & Rights, Quality Control och chefsagenten delar samma versionsbundna kontroll. Den här fasen är regelstyrd och kostnadsfri.</p>
        {runs.filter(r => projects.some(p => p.id === r.projectId && revisionOf(p) === r.revision)).slice(0, 4).map(run =>
          <div className="manager-step" key={run.id}>
            <div className="feed-meta"><strong>{run.title}</strong>
              <span className={'badge ' + (run.status === 'changes_needed' ? 'amber' : 'green')}>
                {run.status === 'changes_needed' ? 'Ändringar behövs' :
                 run.status === 'needs_human_check' ? 'Väntar på din kontroll' : 'Klar för manuell manusgranskning'}
              </span>
            </div>
            <p className="smallprint">Manusversion {run.revision} · {new Date(run.createdAt).toLocaleString('sv-SE')}</p>
            <button className="small" onClick={() => {
              const project = projects.find(p => p.id === run.projectId);
              if (project) onOpenProject(project);
            }}>Öppna manus och kontrollsteg →</button>
          </div>
        )}
        {!runs.some(r => projects.some(p => p.id === r.projectId && revisionOf(p) === r.revision)) &&
          <p>Inga aktuella samordnade manusgranskningar ännu. Öppna ett sparat manus i Videostudio och välj Agentflöde.</p>}
        <button className="small" onClick={() => onNavigate('studio')}>Till Videostudio →</button>
      </div>
    </section>
    <details className="panel manager-roles">
      <summary><Bot size={18} /> Alla agentroller <span className="smallprint">Visa 1 chef + 9 specialister</span></summary>
      <div className="manager-role-grid">
        {productTeam.map((agent, index) => <div className="manager-role" key={agent.id}>
          <div className="feed-meta"><span className="badge">{index === 0 ? 'CHEF' : 'SPECIALIST'}</span><small>Roll {index + 1}</small></div>
          <h3>{agent.name}</h3>
          <p className="smallprint">{agent.role}</p>
          <p className="smallprint">{index === 0
            ? 'Kan nu samordna spårbara, regelstyrda planer. Autonom AI-delegering återstår.'
            : agent.capability}</p>
          <div className="actions">
            <button className="small" onClick={() => onNavigate(agent.page)}>Öppna</button>
            {agent.pauseId && <button className="small ghost" disabled={busy}
              onClick={() => onPause(agent.pauseId!, !paused.includes(agent.pauseId!))}>
              {paused.includes(agent.pauseId) ? 'Återuppta' : 'Pausa'}
            </button>}
          </div>
        </div>)}
      </div>
    </details>
    <div className="notice" style={{ marginTop: 18 }}>
      <ShieldCheck size={14} style={{ display: 'inline', marginRight: 6 }} />
      Vald idé är inte godkänt manus. Granska alltid ett originalmanus separat innan du beställer video eller publicering.
    </div>
  </>;
}
