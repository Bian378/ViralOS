import { useEffect, useState } from 'react';
import { ClipboardList, ShieldCheck } from 'lucide-react';
import type { EditorialRun } from './editorial';
import type { Project } from './model';
import { revisionOf } from './review';

type Props = {
  project: Project;
  saved: Project | null;
  run: EditorialRun | null;
  busy: boolean;
  onRun: (id: string, revision: number) => void;
  onAttest: (id: string, revision: number, runId: string) => void;
};
const label: Record<EditorialStageStatus, string> = {
  done: 'Struktur OK', attention: 'Behöver ändras', human: 'Mänsklig kontroll',
};
type EditorialStageStatus = EditorialRun['stages'][number]['status'];
export default function EditorialWorkflow({ project, saved, run, busy, onRun, onAttest }: Props) {
  const [facts, setFacts] = useState(false);
  const [rights, setRights] = useState(false);
  const current = Boolean(saved && saved.title === project.title &&
    saved.script === project.script && saved.sourceUrl === project.sourceUrl);
  const revision = saved ? revisionOf(saved) : 0;
  const validRun = run && current && run.revision === revision ? run : null;
  useEffect(() => { setFacts(false); setRights(false); }, [validRun?.id, revision]);
  return <details className="panel editorial-panel" style={{ marginTop: 20 }}>
    <summary><ClipboardList size={17} /> Agentflöde · Samordnad manusgranskning
      <span className="badge">{validRun ? 'Version ' + validRun.revision : 'Ej genomförd'}</span>
    </summary>
    <div className="panel-body">
      <p className="smallprint">
        Fyra verkliga, regelstyrda kontrollsteg som delar ett sparat resultat. Inga separata språkmodeller
        körs. Tjänsten kan inte läsa källvideon, verifiera fakta eller avgöra upphovsrätt.
      </p>
      <button className="primary" disabled={busy || !current || !saved}
        onClick={() => saved && onRun(saved.id, revision)}>
        {validRun ? 'Visa / kör om samma versions kontroll' : 'Starta gratis samordnad granskning'}
      </button>
      {!current && <p className="smallprint">Spara den aktuella manusversionen först. Ändringar kräver ny granskning.</p>}
      {validRun && <>
        <div className="feed-meta" style={{ marginTop: 17 }}>
          <span className={'badge ' + (validRun.status === 'changes_needed' ? 'amber' : 'green')}>
            {validRun.status === 'changes_needed' ? 'Ändringar rekommenderas' :
             validRun.status === 'needs_human_check' ? 'Väntar på din kontroll' :
             'Underlag redo för manuell manusgranskning'}
          </span>
          <small>{new Date(validRun.createdAt).toLocaleString('sv-SE')}</small>
        </div>
        <div className="editorial-stages">
          {validRun.stages.map((stage, index) => <div className="editorial-stage" key={stage.role}>
            <div className="feed-meta">
              <strong>{index + 1}. {stage.role}</strong>
              <span className={'badge ' + (stage.status === 'done' ? 'green' : 'amber')}>{label[stage.status]}</span>
            </div>
            <p className="smallprint">{stage.detail}</p>
          </div>)}
        </div>
        {validRun.status === 'needs_human_check' && <div className="editorial-checklist">
          <h3>Din faktakontroll och rättighetsgenomgång</h3>
          <label className="check">
            <input type="checkbox" checked={facts} onChange={e => setFacts(e.target.checked)} />
            Jag har själv kontrollerat manusets sakpåståenden mot tillförlitligt underlag.
          </label>
          <label className="check">
            <input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} />
            Jag har själv kontrollerat att tilltänkt bild-, ljud- och videomaterial får användas.
          </label>
          <button disabled={!facts || !rights || busy} onClick={() => saved &&
            onAttest(saved.id, revision, validRun.id)}>Spara min kontroll</button>
        </div>}
        {validRun.status === 'ready_for_human_review' && <div className="notice">
          Ditt intygande är sparat för version {validRun.revision}. Manuset är ännu inte godkänt.
          Slutligt manusbeslut görs separat under Översikt → Granskningsinkorg.
        </div>}
      </>}
      <div className="notice" style={{ marginTop: 14 }}>
        <ShieldCheck size={14} style={{ display: 'inline', marginRight: 6 }} />
        Ingen av dessa kontroller startar AI-generering, MP4-export, uppladdning eller publicering.
      </div>
    </div>
  </details>;
}
