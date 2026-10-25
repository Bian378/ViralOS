import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { retrievePrivateReviewMP4 } from './cloud-review-client';

type Item = {
  id: string;
  title: string;
  state: 'awaiting_owner_review' | 'changes_requested' | 'video_reviewed_no_upload_permission';
  version: number;
  selectedDraftRole: string | null;
  videoSha256: string;
  hasUploadPermission: false;
  hasPublishPermission: false;
};
type Checks = {
  factsChecked: boolean;
  originalAndMediaRightsChecked: boolean;
  voiceRightsChecked: boolean;
  captionsSyncedToSpokenAudio: boolean;
  finalVideoWatched: boolean;
};

const items: { id: keyof Checks; label: string }[] = [
  { id: 'factsChecked', label: 'Jag har faktagranskat manuset' },
  { id: 'originalAndMediaRightsChecked', label: 'Jag har kontrollerat rättigheter till grafik och innehåll' },
  { id: 'voiceRightsChecked', label: 'Jag har kontrollerat röst och ljudrättigheter (ingen röst i tysta MP4)' },
  { id: 'captionsSyncedToSpokenAudio', label: 'Jag har kontrollerat tidsättning för text och eventuellt tal' },
  { id: 'finalVideoWatched', label: 'Jag har sett hela den slutliga videofilen' },
];
const initial = (): Checks => ({
  factsChecked: false,
  originalAndMediaRightsChecked: false,
  voiceRightsChecked: false,
  captionsSyncedToSpokenAudio: false,
  finalVideoWatched: false,
});
const messageOf = (err: unknown) =>
  err instanceof Error ? err.message : 'Kunde inte slutföra videogranskningen.';

export default function CloudReviewCard({
  item, onChanged,
}: { item: Item; onChanged: () => Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [checks, setChecks] = useState<Checks>(initial);
  const [comment, setComment] = useState('');

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function preview() {
    setBusy(true); setStatus('');
    try {
      if (url) URL.revokeObjectURL(url);
      setUrl(null);
      setUrl(await retrievePrivateReviewMP4(item.id, item.videoSha256));
      setStatus('Exakt lagrad MP4 verifierad. Granska den innan beslut.');
    } catch (err) { setStatus(messageOf(err)); }
    finally { setBusy(false); }
  }
  async function decide(decision: 'request_changes' | 'mark_video_reviewed') {
    if (decision === 'mark_video_reviewed' && (!url || items.some(x => !checks[x.id]))) {
      setStatus('Förhandsgranska filmen och markera alla fem kontroller först.');
      return;
    }
    if (decision === 'request_changes' && !comment.trim()) {
      setStatus('Beskriv vilka ändringar som behövs.');
      return;
    }
    if (!confirm(decision === 'mark_video_reviewed'
      ? 'Spara som manuellt granskad? Detta GER INTE tillstånd att ladda upp eller publicera.'
      : 'Spara dina ändringskrav? Ingen publicering kommer att ske.')) return;
    setBusy(true); setStatus('');
    try {
      await api.post('/api/video-reviews/' + encodeURIComponent(item.id) + '/decision', {
        decision,
        expectedVersion: item.version,
        expectedVideoSha256: item.videoSha256,
        explicitOwnerAction: true,
        checks, comment,
      });
      setStatus('Ditt beslut är sparat. YouTube-publicering förblir blockerad.');
      await onChanged();
    } catch (err) { setStatus(messageOf(err)); }
    finally { setBusy(false); }
  }

  return <div className="panel" style={{ marginTop: 16, padding: 18 }}>
    <h4>{item.title}</h4>
    <p className="smallprint">Version {item.version} · {item.state === 'awaiting_owner_review'
      ? 'Väntar på ditt videobeslut' : item.state === 'changes_requested'
      ? 'Ändringar begärda' : 'Manuellt granskad – ingen YouTube-behörighet'}</p>
    <p className="smallprint">SHA-256: <code>{item.videoSha256.slice(0, 18)}…</code></p>
    <button className="small" disabled={busy} onClick={preview}>
      {busy ? 'Verifierar…' : 'Visa sparad MP4'}
    </button>
    {url && <video controls src={url} style={{
      display: 'block', maxWidth: 280, width: '100%', maxHeight: 490, marginTop: 14,
    }} aria-label={'Privat granskningsvideo: ' + item.title} />}
    {item.state === 'awaiting_owner_review' && <>
      <div style={{ marginTop: 16 }}>
        <h4>Manuella kontroller</h4>
        {items.map(check => <label key={check.id} className="check" style={{ display: 'block' }}>
          <input type="checkbox" checked={checks[check.id]}
            onChange={event => setChecks(old => ({ ...old, [check.id]: event.target.checked }))} />
          {check.label}
        </label>)}
        <label style={{ display: 'block', marginTop: 12 }}>
          Kommentar eller ändringskrav
          <textarea rows={2} maxLength={1000} value={comment}
            onChange={event => setComment(event.target.value)}
            placeholder="Skriv vad som ska justeras före nästa video." />
        </label>
        <div className="actions">
          <button className="small" disabled={busy} onClick={() => decide('request_changes')}>
            Begär ändringar
          </button>
          <button className="small primary" disabled={busy || !url || items.some(x => !checks[x.id])}
            onClick={() => decide('mark_video_reviewed')}>
            Markera videon som granskad
          </button>
        </div>
      </div>
    </>}
    {status && <p role="status" className="smallprint">{status}</p>}
    <p className="smallprint">En video som markerats som granskad kan fortfarande inte laddas upp eller publiceras.</p>
  </div>;
}
