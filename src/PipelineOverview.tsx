/**
 * Owner-scoped live pipeline overview. Script reviews and stored-video reviews
 * are DIFFERENT resources: never infer that matching titles are the same media.
 * No AI generation, media upload or publication action is launched here.
 */
import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { reviewStatus } from './review';
import type { Project } from './model';

type Video = {
  id: string;
  title: string;
  state: 'awaiting_owner_review' | 'changes_requested' | 'video_reviewed_no_upload_permission';
  videoSha256: string;
  hasUploadPermission: false;
  hasPublishPermission: false;
};
type Radar = { enabled: boolean; lastSuccess: string | null; lastError: string | null };
const scriptLabel: Record<string, string> = {
  pending: 'Manus behöver granskas',
  approved_script: 'Manus godkänt, film ej godkänd',
  needs_changes: 'Ändringar i manus behövs',
  revoked: 'Manusgodkännande återkallat',
};
const mediaLabel: Record<Video['state'], string> = {
  awaiting_owner_review: 'Video väntar på kontroll',
  changes_requested: 'Video behöver ändras',
  video_reviewed_no_upload_permission: 'Video granskad, ej uppladdningsklar',
};
export default function PipelineOverview({
  projects, onOpenProject, onNavigate,
}: {
  projects: Project[];
  onOpenProject: (project: Project) => void;
  onNavigate: (view: string) => void;
}) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [radar, setRadar] = useState<Radar | null>(null);
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  async function reload() {
    setLoading(true);
    setWarning('');
    const [videoResponse, radarResponse] = await Promise.allSettled([
      api.get('/api/video-reviews'),
      api.get('/api/auto-trends'),
    ]);
    if (videoResponse.status === 'fulfilled') {
      const data = videoResponse.value.data;
      if (Array.isArray(data.items) && data.items.length <= 30 &&
          data.items.every((item: Video) =>
            typeof item.id === 'string' && typeof item.title === 'string' &&
            item.hasPublishPermission === false && item.hasUploadPermission === false)) {
        setVideos(data.items);
      } else {
        setVideos(null);
        setWarning('Serverns privata granskningslista kunde inte verifieras.');
      }
    } else {
      setVideos(null);
      setWarning('Privat videokö gick inte att läsa. Ingen publicering är möjlig.');
    }
    if (radarResponse.status === 'fulfilled' &&
        typeof radarResponse.value.data.enabled === 'boolean') {
      setRadar(radarResponse.value.data);
    } else {
      setRadar(null);
      setWarning(previous => previous ||
        'Automatisk trendskanning kunde inte bekräftas. Status visas som okänd.');
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  const waitingScripts = projects.filter(item => reviewStatus(item) !== 'approved_script');
  const approvedScripts = projects.filter(item => reviewStatus(item) === 'approved_script');
  const pendingVideos = videos?.filter(video => video.state !== 'video_reviewed_no_upload_permission');
  const reviewedVideos = videos?.filter(video => video.state === 'video_reviewed_no_upload_permission');

  return <section className="panel" style={{ marginBottom: 22 }}>
    <div className="panel-header">
      <h2>Produktionsflöde · aktuellt läge</h2>
      <button className="small ghost" disabled={loading} onClick={() => void reload()}>
        {loading ? 'Uppdaterar…' : 'Uppdatera flöde'}
      </button>
    </div>
    <div className="panel-body">
      <p className="smallprint">
        Hämtat från din arbetsyta och privata serverkö. Antal manus och filmer räknas
        separat. En godkänd manusversion innebär INTE att en färdig video är granskad.
      </p>
      <div className="metrics">
        <button className="metric metric-link" onClick={() => onNavigate('radar')}>
          <span className="metric-top">YouTube-radar</span>
          <span className="metric-number" style={{ fontSize: 20 }}>
            {radar ? radar.enabled ? 'Aktiv' : 'Avstängd' : 'Okänd'}
          </span>
          <small>{radar?.lastSuccess ? 'Senaste lyckade körning registrerad' : 'Ingen bekräftad automatisk hämtning'}</small>
        </button>
        <button className="metric metric-link"
          onClick={() => document.getElementById('review-inbox')?.scrollIntoView({ behavior: 'smooth' })}>
          <span className="metric-top">Manus godkända</span>
          <span className="metric-number">{approvedScripts.length}</span>
          <small>{waitingScripts.length} återstår att granska</small>
        </button>
        <button className="metric metric-link" onClick={() => onNavigate('review-inbox')}>
          <span className="metric-top">Filmer att granska</span>
          <span className="metric-number">{pendingVideos ? pendingVideos.length : '—'}</span>
          <small>Privat lagrade MP4</small>
        </button>
        <button className="metric metric-link" onClick={() => onNavigate('review-inbox')}>
          <span className="metric-top">Filmer granskade</span>
          <span className="metric-number">{reviewedVideos ? reviewedVideos.length : '—'}</span>
          <small>Ingen uppladdningsbehörighet</small>
        </button>
      </div>
      {warning && <div className="notice amber" role="status">{warning}</div>}
      <div className="columns" style={{ marginTop: 16 }}>
        <div>
          <h3>Senaste manus</h3>
          {projects.length ? projects.slice(0, 4).map(item =>
            <div className="feed-row" key={item.id}>
              <h4>{item.title}</h4>
              <p className="smallprint">{scriptLabel[reviewStatus(item)] || 'Granska denna manusversion'}</p>
              <button className="small" onClick={() => onOpenProject(item)}>
                Öppna i Videostudio →
              </button>
            </div>
          ) : <p className="smallprint">Inga sparade manus. Börja med Trendradar eller skriv en egen berättelse.</p>}
        </div>
        <div>
          <h3>Privata videoexemplar</h3>
          {videos === null && <p className="smallprint">Status är inte verifierad.</p>}
          {videos?.length === 0 && <p className="smallprint">Ingen MP4 har importerats till din privata videokö.</p>}
          {videos?.slice(0, 4).map(item =>
            <div className="feed-row" key={item.id}>
              <h4>{item.title}</h4>
              <p className="smallprint">{mediaLabel[item.state] || 'Okänt tillstånd'}</p>
              <button className="small" onClick={() => onNavigate('review-inbox')}>
                Granska exakt MP4 →
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="notice" style={{ marginTop: 15 }}>
        <strong>Publiceringsstopp:</strong> Ingen Short kan laddas upp till YouTube här.
        AI-voiceover, verklig tal-till-text-synkronisering och separat YouTube OAuth
        återstår. De körs inte bara för att ett manus eller en video är granskad.
      </div>
    </div>
  </section>;
}
