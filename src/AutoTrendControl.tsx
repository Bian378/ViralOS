import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';

type Status = {
  enabled: boolean;
  intervalMinutes: number;
  lastAttempt: string | null;
  lastSuccess: string | null;
  lastCount: number;
  lastError: string | null;
  cooldownUntil: string | null;
  scansAutomaticallyProduceVideos: false;
  publishesAutomatically: false;
};
const fmt = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })
  : 'Ännu ingen körning';
const errorText = (error: unknown) => {
  const e = error as { response?: { data?: { error?: string } }; message?: string };
  return e.response?.data?.error || e.message || 'Kunde inte läsa radarstatus.';
};

export default function AutoTrendControl({ youtube, onRefresh }: {
  youtube: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const data = (await api.get('/api/auto-trends')).data as Status;
    if (typeof data.enabled !== 'boolean' ||
        data.scansAutomaticallyProduceVideos !== false ||
        data.publishesAutomatically !== false) {
      throw Error('Ogiltig eller osäker status från YouTube-radarn.');
    }
    setStatus(data);
  }
  useEffect(() => { void load().catch(err => setError(errorText(err))); }, []);

  async function change(next: boolean) {
    if (next && !youtube) {
      setError('Anslut först YouTube Data API.');
      return;
    }
    if (next && !confirm('Aktivera YouTube-kontroll ungefär varje timme? Varje lyckat anrop använder din YouTube API-kvot, men inga AI-krediter, videoköp eller publiceringar startas.')) return;
    if (!next && !confirm('Pausa alla framtida automatiska YouTube-insamlingar för ditt konto?')) return;
    setBusy(true); setError('');
    try {
      await api.post('/api/auto-trends', { enabled: next });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true); setError('');
    try {
      await Promise.all([load(), onRefresh()]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel" style={{ margin: '16px 0' }}>
    <div className="panel-header">
      <h2>Automatisk YouTube-radar</h2>
      <span className={'badge ' + (status?.enabled ? 'green' : 'amber')}>
        {status ? status.enabled ? 'Aktiv · varje timme' : 'Avstängd' : 'Läser status'}
      </span>
    </div>
    <div className="panel-body">
      <p className="smallprint">
        Opt-in: hämtar endast YouTubes officiella popularitetsurval i din sparade region.
        Detta är inte en verifierad Shorts-lista. Senaste och tidigare mätningar kan jämföras.
        Ingen automatisk AI, video eller YouTube-publicering.
      </p>
      <div className="actions">
        <button className={status?.enabled ? 'danger' : 'primary'} disabled={busy || !status || (!youtube && !status.enabled)}
          onClick={() => change(!status?.enabled)}>
          {status?.enabled ? 'Stoppa automatiska hämtningar' : 'Aktivera timvis trendinsamling'}
        </button>
        <button className="small" disabled={busy} onClick={refresh}>Uppdatera status och signaler</button>
      </div>
      <p className="smallprint">Senaste försök: {fmt(status?.lastAttempt || null)} · Senaste lyckade hämtning: {fmt(status?.lastSuccess || null)}
        {status?.lastSuccess ? ' · ' + status.lastCount + ' källsignaler' : ''}
      </p>
      {status?.lastError && <p className="notice amber" role="status">Senaste fel: {status.lastError}</p>}
      {status?.cooldownUntil && <p className="smallprint">API-begränsning: paus till {fmt(status.cooldownUntil)}.</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <p className="smallprint">Schemat använder normalt högst ett YouTube-anrop per timme för ditt konto, cirka 24 per dygn när radarn är aktiv.
        Högst tre konton kan aktivera funktionen i samma app. Din Google API-kvot gäller.</p>
    </div>
  </section>;
}
