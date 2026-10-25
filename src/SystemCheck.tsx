import { useState } from 'react';
import { api } from '@appdeploy/client';
import { Activity, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

type Check = { name: string; ok: boolean; detail: string };
type Result = {
  checkedAt: string;
  passed: number;
  total: number;
  allPassed: boolean;
  schedulerPaused: boolean;
  checks: Check[];
  note: string;
};

function errorText(value: unknown): string {
  const error = value as { message?: string; response?: { data?: { error?: string } } };
  return error.response?.data?.error || error.message || 'Systemtestet kunde inte startas.';
}

export default function SystemCheck({ onSimulateOutage }: { onSimulateOutage: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [queueOk, setQueueOk] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setRunning(true);
    setError('');
    setResult(null);
    setQueueOk(null);
    try {
      const data = await api.post('/api/system-check', {});
      setResult(data.data);
      try {
        const q = await api.get('/api/queue');
        setQueueOk(Array.isArray(q.data?.jobs) && typeof q.data?.stopped === 'boolean');
      } catch {
        setQueueOk(false);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(false);
    }
  }
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">KVALITETSSÄKRING / STEG 1</div>
          <h1>Grundsystemets systemkontroll</h1>
          <p>Testa inloggad åtkomst, databasens skapande, läsning, versionsskydd,
            radering och kölagring utan att ändra dina manus eller starta någon AI-produktion.</p>
        </div>
      </div>
      <div className="notice amber">
        Kvalitetssäkringsläge: automatiska schemalagda jobb är pausade.
        Systemtestet använder en tillfällig separat databasrad och tar bort den efteråt.
        Inga leverantörskrediter eller YouTube-uppladdningar startas.
      </div>
      <section className="panel">
        <div className="panel-header"><h2><ShieldCheck size={18} /> Server och databas</h2>
          <span className="badge">Manuellt test</span></div>
        <div className="panel-body">
          <button className="primary" onClick={run} disabled={running}>
            <Activity size={15} style={{ display: 'inline', marginRight: 7 }} />
            {running ? 'Testar grundsystemet…' : 'Kör grundsystemtest'}
          </button>
          {error && <div className="notice error" role="alert" style={{ marginTop: 16 }}>{error}</div>}
          {result && (
            <div style={{ marginTop: 18 }}>
              <div className={'notice ' + (result.allPassed && queueOk ? '' : 'amber')}>
                <strong>{result.passed} av {result.total} backendkontroller godkända</strong>
                <p>Kö-API: {queueOk === true ? 'Tillgängligt' : 'Kunde inte verifieras'}</p>
                <p>Tidpunkt: {new Date(result.checkedAt).toLocaleString('sv-SE')}</p>
              </div>
              {result.checks.map(item => (
                <div className="feed-row" key={item.name}>
                  <div className="actions">
                    {item.ok ? <CheckCircle2 size={19} color="#69e5b2" /> :
                      <AlertTriangle size={19} color="#e9c48c" />}
                    <strong>{item.name}</strong>
                  </div>
                  <p className="smallprint">{item.detail}</p>
                </div>
              ))}
              <p className="smallprint">{result.note}</p>
            </div>
          )}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header"><h2>Återhämtning vid serverfel</h2><span className="badge">Test 503</span></div>
        <div className="panel-body">
          <p>Det här testet gör ett autentiserat anrop som avsiktligt svarar med HTTP 503 och använder samma fel- och återhämtningsvy som vid ett verkligt fel i arbetsytans inläsning. Inga sparade projekt eller serverjobb ändras.</p>
          <button disabled={running} onClick={onSimulateOutage}>Simulera serverfel (503)</button>
          <p className="smallprint">Förväntat: privat innehåll döljs och ett fel visas. Klicka på Försök igen för att kontrollera att arbetsytan återställs. Det här simulerar ett svarsfel, inte ett fysiskt databasavbrott.</p>
        </div>
      </section>
      <div className="notice" style={{ marginTop: 20 }}>
        Fullständigt godkännande av steg 1 kräver även test av inloggning/utloggning,
        behörighet mellan olika konton, sparade manus efter siduppdatering
        och köhantering i webbläsaren. Enbart gröna backendkontroller räcker inte.
      </div>
    </>
  );
}
