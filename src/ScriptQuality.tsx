import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { ClipboardCheck, ShieldCheck, Sparkles } from 'lucide-react';
import type { Project } from './model';
import { revisionOf } from './review';
import type { QualityReport } from './script-quality';

type Props = {
  project: Project; saved: Project | null; aiEnabled: boolean; busy: boolean;
  onApply: (script: string) => void;
};
const words = (s: string) => s.trim() ? s.trim().split(/\s+/).length : 0;
function message(err: unknown) {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e.response?.data?.error || e.message || 'Granskningen misslyckades.';
}

export default function QualityWorkbench({ project, saved, aiEnabled, busy, onApply }: Props) {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const unchanged = Boolean(saved && saved.title === project.title &&
    saved.script === project.script && saved.sourceUrl === project.sourceUrl);
  const revision = saved ? revisionOf(saved) : 0;
  useEffect(() => {
    let active = true;
    setError(''); setReport(null);
    if (!saved || !unchanged) return;
    setLoading(true);
    api.get('/api/projects/' + encodeURIComponent(saved.id) + '/agent-review')
      .then(r => { if (active) setReport(r.data || null); })
      .catch(e => { if (active) setError(message(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [saved?.id, revision, unchanged]);
  const n = words(project.script);
  const paragraphs = project.script.split(/\n\s*\n/).filter(s => s.trim());
  const hookWords = words(paragraphs[0] || '');
  const checks = [
    { label: 'Längd', pass: n >= 80 && n <= 150,
      detail: n + ' ord · rekommenderat 80–150 ord för detta manusformat' },
    { label: 'Stark och kort öppning', pass: hookWords >= 3 && hookWords <= 12,
      detail: hookWords + ' ord i första stycket · välj en tydlig 1–3 sekunders hook' },
    { label: 'Styckeindelning', pass: paragraphs.length >= 3 && paragraphs.length <= 8,
      detail: paragraphs.length + ' stycken · håll en idé per stycke' },
    { label: 'Källspårning', pass: Boolean(project.sourceUrl.trim()),
      detail: project.sourceUrl ? 'Källänk finns' : 'Lägg till en källa om du bygger på verkliga händelser' },
  ];
  async function analyze() {
    if (!saved || !unchanged || !aiEnabled || running) return;
    if (!window.confirm('Kör AI Quality Control på detta sparade manus? Detta använder ett AI-anrop till okänd kostnad i leverantörskrediter. Förslaget sparas separat och ändrar INTE ditt manus.')) return;
    setRunning(true); setError('');
    try {
      const response = await api.post('/api/projects/' + encodeURIComponent(saved.id) + '/agent-review', {
        revision, acceptUnknownCost: true,
      });
      setReport(response.data);
    } catch (e) { setError(message(e)); }
    finally { setRunning(false); }
  }
  return <details className="panel quality-panel" style={{ marginTop: 20 }}>
    <summary><ClipboardCheck size={17} /> Manusanalys och AI-kvalitetskontroll</summary>
    <div className="panel-body">
      <p className="smallprint">Gratis förkontroll utifrån manusets längd och struktur. Ingen språkmodell används för dessa kontroller.</p>
      <div className="quality-checks">
        {checks.map(item => <div className="quality-check" key={item.label}>
          <span className={'badge ' + (item.pass ? 'green' : 'amber')}>{item.pass ? 'OK' : 'Se över'}</span>
          <div><strong>{item.label}</strong><p className="smallprint">{item.detail}</p></div>
        </div>)}
      </div>
      <p className="smallprint">Observera: den gratis kontrollen bevisar inte att hooken är bra, att engelskan är korrekt eller att påståenden är sanna.</p>
      <div className="actions" style={{ flexWrap:'wrap' }}>
        <button disabled={running || busy || !saved || !unchanged || !aiEnabled} onClick={analyze}>
          <Sparkles size={14} style={{ display:'inline',marginRight:6 }} />
          {running ? 'AI granskar…' : 'AI-granska sparat manus'}
        </button>
        {!aiEnabled && <span className="smallprint">Separat AI-provning är avstängd under Inställningar.</span>}
        {!unchanged && <span className="smallprint">Spara först aktuell manusversion för att låsa AI-granskningen till rätt text.</span>}
      </div>
      {loading && <p className="smallprint">Läser tidigare granskning…</p>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {report && unchanged && <>
        <div className="quality-report">
          <div className="feed-meta">
            <span className="badge green">AI-förslag · Version {report.revision}</span>
            <small>{new Date(report.createdAt).toLocaleString('sv-SE')}</small>
          </div>
          <h3>Quality Control-agentens återkoppling</h3>
          <p><strong>Hook:</strong> {report.hookFeedback}</p>
          <p><strong>Struktur:</strong> {report.structureFeedback}</p>
          <p><strong>Faktakontroll behövs:</strong> {report.factFlags.join(' · ') || 'Alla sakuppgifter måste verifieras mot källan.'}</p>
          <label>Föreslagen förbättrad engelsk version
            <textarea value={report.revisedScript} readOnly rows={8} />
          </label>
          <button className="primary small" onClick={() => {
            if (window.confirm('Lägg förslaget i redigeraren? Originalmanuset på servern ändras inte förrän du klickar på Spara manus. Tidigare manusgodkännande gäller inte en ändrad text.')) onApply(report.revisedScript);
          }}>Använd förslaget i redigeraren</button>
        </div>
      </>}
      <div className="notice" style={{marginTop:14}}>
        <ShieldCheck size={14} style={{ display:'inline',marginRight:6 }} />
        Quality Control är en AI-bedömning, inte en verifierad faktagranskning. Ingen ändring sparas automatiskt och ingenting publiceras.
      </div>
    </div>
  </details>;
}
