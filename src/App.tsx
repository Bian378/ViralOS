import { useEffect, useRef, useState } from 'react';
import { api, auth } from '@appdeploy/client';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  ChevronDown,
  Moon,
  Sun,
  CircleHelp,
  Download,
  ExternalLink,
  Film,
  LayoutDashboard,
  LogOut,
  Plus,
  Radar,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Unplug,
  X,
  Zap,
} from 'lucide-react';
import {
  initialState,
  signalGrowth,
  type Project,
  type Settings,
  type State,
  type Trend,
} from './model';
import { renderMP4 } from './render';
import type { Mp4TrackProof } from './mp4-proof';
import VideoSelfTest from './VideoSelfTest';
import type { VideoStyle } from './video-timeline';
import { measuredYouTubeGrowth } from './youtube-growth';
import JobCenter from './JobCenter';
import Dashboard from './Dashboard';
import AgentTeam from './AgentTeam';
import SystemCheck from './SystemCheck';
import TrendLab from './TrendLab';
import QualityWorkbench from './ScriptQuality';
import ShortsPlanPreview from './ShortsPlanPreview';
import EditorialWorkflow from './EditorialWorkflow';
import ReviewInboxPreview from './ReviewInboxPreview';
import { buildLocalReviewPacket } from './local-review-packet';
import { uploadLocalReviewDraft, clearIncompleteReviewUpload, reconcileStoredReviewUpload } from './cloud-review-client';
import AutoTrendControl from './AutoTrendControl';
import { revisionOf, scriptHash, type ScriptReview } from './review';

const navigation = [
  { id: 'overview', name: 'Översikt', icon: LayoutDashboard },
  { id: 'agents', name: 'AI-agenter', icon: Bot },
  { id: 'jobs', name: 'Bakgrundsjobb', icon: Activity },
  { id: 'radar', name: 'Trendradar', icon: Radar },
  { id: 'trend-lab', name: 'Trendlabb', icon: Radar },
  { id: 'studio', name: 'Videostudio', icon: Film },
  { id: 'review-inbox', name: 'Videogranskning', icon: ShieldCheck },
  { id: 'calendar', name: 'Publicering', icon: CalendarDays },
  { id: 'analytics', name: 'Analys & tillväxt', icon: BarChart3 },
  { id: 'connections', name: 'Anslutningar', icon: Unplug },
  { id: 'settings', name: 'Inställningar', icon: Settings2 },
  { id: 'system-check', name: 'Systemkontroll', icon: ShieldCheck },
];
const navigationGroups = [
  { id: 'discover', name: 'Upptäck', icon: Radar, pages: ['radar', 'trend-lab'] },
  { id: 'create', name: 'Skapa', icon: Film, pages: ['agents', 'jobs', 'studio'] },
  { id: 'results', name: 'Resultat', icon: BarChart3, pages: ['review-inbox', 'calendar', 'analytics'] },
  { id: 'system', name: 'System', icon: Settings2, pages: ['connections', 'settings', 'system-check'] },
];
type Connections = {
  youtubeConfigured: boolean;
  hnCachedAt: string | null;
  hnLastError: string | null;
};
type User = { userId: string; name?: string; email?: string };
type Rendered = {
  blob: Blob;
  url: string;
  duration: number;
  bytes: number;
  withNarration: boolean;
  mp4Proof: Mp4TrackProof;
  style: VideoStyle;
  subtitles: string;
  scenes: number;
  captionsEstimated: true;
  draft: { title: string; script: string; sourceUrl: string; origin: string };
};
const date = (value: string) =>
  new Date(value).toLocaleString('sv-SE', {
    timeZone: 'Europe/Madrid',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const number = (value: number) => new Intl.NumberFormat('sv-SE').format(value);
function errorMessage(e: unknown) {
  const err = e as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
    code?: string;
  };
  if (err.code === 'popup_blocked')
    return 'Tillåt popupfönster för att logga in.';
  if (err.code === 'popup_closed')
    return 'Inloggningen avbröts. Försök igen när du är redo.';
  return (
    err.response?.data?.error ||
    err.response?.data?.message ||
    err.message ||
    'Något gick fel. Försök igen.'
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Zap size={20} fill="currentColor" />
      </span>
      ViralOS <b>AI</b>
    </div>
  );
}
function Badge({
  children,
  tone = '',
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={'badge ' + tone}>{children}</span>;
}
function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <CircleHelp size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function downloadText(filename: string, value: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function newProject(): Project {
  return {
    id: crypto.randomUUID(),
    title: '',
    script: '',
    sourceUrl: '',
    origin: 'manual',
    createdAt: '',
    updatedAt: '',
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [state, setState] = useState<State>(initialState);
  const [connections, setConnections] = useState<Connections>({
    youtubeConfigured: false,
    hnCachedAt: null,
    hnLastError: null,
  });
  const [page, setPage] = useState('overview');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('YouTube');
  const [settings, setSettings] = useState<Settings>(initialState.settings);
  const [edit, setEdit] = useState<Project>(newProject);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [rendering, setRendering] = useState(false);
  const [narrationFile, setNarrationFile] = useState<File | null>(null);
  const [narrationRights, setNarrationRights] = useState(false);
  const [videoStyle, setVideoStyle] = useState<VideoStyle>('cinematic');
  const [narrationPreview, setNarrationPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [uploadingReview, setUploadingReview] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const aiRequest = useRef<{ trendId: string; id: string } | null>(null);
  const renderUrl = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const pendingRecoveryTest = useRef(false);

  useEffect(() => {
    if (!narrationFile) { setNarrationPreview(null); return; }
    const url = URL.createObjectURL(narrationFile);
    setNarrationPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [narrationFile]);

  async function load(simulate503 = false) {
    const generation = ++loadGeneration.current;
    const workspace = await api.get(simulate503 ? '/api/system-check/simulated-503' : '/api/state');
    if (generation !== loadGeneration.current) return;
    setState(workspace.data);
    setSettings(workspace.data.settings);
    setTheme(workspace.data.settings.theme === 'light' ? 'light' : 'dark');
    setWorkspaceReady(true);
    if (pendingRecoveryTest.current) {
      pendingRecoveryTest.current = false;
      setToast('Återhämtning godkänd: sparad arbetsyta kunde läsas efter testfelet.');
    }
    try {
      const integration = await api.get('/api/integrations');
      if (generation !== loadGeneration.current) return;
      setConnections(integration.data);
    } catch {
      if (generation !== loadGeneration.current) return;
      // A failed integration check must not hide saved projects or enable unverified providers.
      setConnections({ youtubeConfigured: false, hnCachedAt: null, hnLastError: null });
      setError('Arbetsytan laddades, men anslutningarnas status kunde inte kontrolleras. YouTube-funktioner är tillfälligt avstängda. Försök uppdatera status.');
    }
  }
  async function changeTheme(next: 'dark' | 'light') {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    setError('');
    setBusy(true);
    try {
      await api.post('/api/theme', { theme: next });
      await load();
      setToast('Utseendet sparades för ditt konto.');
    } catch (e) {
      setTheme(previous);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const found = navigationGroups.find(g => g.pages.includes(page));
    setOpenGroup(found?.id ?? null);
  }, [page]);
  function simulateWorkspaceOutage() {
    pendingRecoveryTest.current = true;
    setWorkspaceReady(false);
    setError('');
    // Intentional 503 is caught by the same error/retry flow as failed workspace loading.
    void load(true).catch(e => setError(errorMessage(e)));
  }
  useEffect(() => {
    auth
      .getUser()
      .then(u => {
        setUser(u);
        if (u) return load();
      })
      .catch(e => setError(errorMessage(e)))
      .finally(() => setChecking(false));
    return () => {
      if (renderUrl.current) URL.revokeObjectURL(renderUrl.current);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function act(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function invalidate() {
    if (renderUrl.current) URL.revokeObjectURL(renderUrl.current);
    renderUrl.current = null;
    setRendered(null);
    setReviewed(false);
  }
  function openProject(project: Project) {
    invalidate();
    setNarrationFile(null);
    setNarrationRights(false);
    setEdit(project);
    setPage('studio');
    setError('');
  }
  async function collect(kind: string) {
    await act(async () => {
      const result = await api.post('/api/collect', { source: kind });
      await load();
      setSource(kind === 'youtube' ? 'YouTube' : 'Hacker News');
      setToast(result.data.count + ' verkliga källsignaler hämtade');
      setPage('radar');
    });
  }
  async function draft(trend: Trend) {
    if (!state.settings.aiTrial) {
      setPage('settings');
      setError(
        'Aktivera manuell AI-provning först. Kostnaden i leverantörskrediter är okänd och ingår inte i eurobudgeten.'
      );
      return;
    }
    if (
      !confirm(
        'Skapa ett AI-manus? Detta använder leverantörskrediter. Exakt kostnad är inte tillgänglig. Manuell provkörning ligger utanför eurobudgeten.'
      )
    )
      return;
    if (!aiRequest.current || aiRequest.current.trendId !== trend.id)
      aiRequest.current = { trendId: trend.id, id: crypto.randomUUID() };
    await act(async () => {
      const result = await api.post('/api/draft', {
        trendId: trend.id,
        requestId: aiRequest.current!.id,
        acceptUnknownCost: true,
      });
      await load();
      openProject(result.data);
      aiRequest.current = null;
      setToast('AI-utkast sparat. Kontrollera fakta före användning.');
    });
  }
  async function saveProject() {
    if (!edit.title.trim() || !edit.script.trim()) {
      setError('Titel och manus krävs.');
      return;
    }
    await act(async () => {
      const result = await api.post('/api/projects', { ...edit, revision: revisionOf(edit) });
      setEdit(result.data);
      await load();
      setToast('Manuset är sparat');
    });
  }
  async function exportVideo() {
    if (narrationFile && !narrationRights) {
      setError('Bekräfta ljudfilens användningsrättigheter innan MP4-export.');
      return;
    }
    setError('');
    setRendering(true);
    setProgress(0);
    invalidate();
    try {
      const draft = { title: edit.title, script: edit.script, sourceUrl: edit.sourceUrl, origin: edit.origin };
      const result = await renderMP4(draft.script, setProgress, narrationFile, videoStyle);
      renderUrl.current = result.url;
      setRendered({ ...result, draft });
      setToast(result.withNarration
        ? 'MP4 med berättarröst klar. Granska ljudet och textens timing.'
        : 'Tyst MP4 klar. Mått och speltid verifierade.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRendering(false);
    }
  }
  async function exportReviewPacket() {
    if (!rendered) return;
    setError('');
    try {
      const packet = await buildLocalReviewPacket(rendered.blob, rendered.draft, { narrationPresent: rendered.withNarration });
      downloadText('review-queue-item-DRAFT.json', JSON.stringify(packet, null, 2), 'application/json');
      setToast('Granskningsfil hämtad. Öppna Resultat → Videogranskning och välj JSON + samma MP4.');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function saveVideoInPrivateQueue() {
    if (!rendered || uploadingReview) return;
    if (!confirm('Spara denna exakta MP4 i din privata granskningskö? Detta använder appens lagring och nätverk, men startar inga betalda AI-anrop eller YouTube-uppladdningar.')) return;
    setError('');
    setUploadingReview(true);
    setUploadProgress(0);
    try {
      const packet = await buildLocalReviewPacket(rendered.blob, rendered.draft, { narrationPresent: rendered.withNarration });
      await uploadLocalReviewDraft(rendered.blob, packet, setUploadProgress);
      setToast('Videon är verifierad och sparad för privat granskning. Ingen publicering är tillåten.');
      setPage('review-inbox');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploadingReview(false);
    }
  }
  async function recoverIncompleteReviewUpload() {
    if (uploadingReview || rendering) return;
    await act(async () => {
      const response = await reconcileStoredReviewUpload();
      if (response.resolved) {
        setToast('Tidigare verifierad MP4 är återställd i den privata granskningskön.');
        setPage('review-inbox');
      } else if (response.status === 'unconfirmed') {
        setError(response.message ||
          'Det saknas ett bekräftat videokvitto. Ingen ny import startades.');
      } else if (response.status === 'receiving') {
        setToast('Videon är bara delvis uppladdad. Fortsätt med samma fil eller avbryt importen.');
      } else {
        setToast('Ingen verifierad video behöver återhämtas.');
      }
    });
  }
  async function cancelIncompleteReviewUpload() {
    if (uploadingReview || !confirm('Avbryt pågående privat videoimport? Delar som ännu inte slutförts kan behöva städas bort. Färdiga granskningar påverkas inte.')) return;
    await act(async () => {
      const result = await clearIncompleteReviewUpload();
      setToast(result.cancelled ? 'Ofullständig videoimport avbruten. Du kan börja en ny.' : 'Ingen avbrytbar import pågår.');
    });
  }
  const filtered = state.trends.filter(
    t =>
      (source === 'all' || t.source === source) &&
      t.title.toLowerCase().includes(search.toLowerCase())
  );
  const currentNav = navigation.find(n => n.id === page)!;

  function TrendCard({ trend }: { trend: Trend }) {
    const growth = signalGrowth(trend);
    const youtubeVelocity = measuredYouTubeGrowth(trend);
    return (
      <div className="feed-row">
        <div className="feed-meta">
          <span>
            <Badge tone={trend.source === 'YouTube' ? 'violet' : 'amber'}>
              {trend.source}
            </Badge>
            <small>{trend.region}</small>
          </span>
          <small>{date(trend.observedAt)}</small>
        </div>
        <h3>{trend.title}</h3>
        <div className="feed-meta">
          <span>
            {number(trend.value)} {trend.metric} ·{' '}
            {trend.source === 'YouTube'
              ? youtubeVelocity === null
                ? 'Observerat råvärde · Shorts-format ej verifierat'
                : number(Math.round(youtubeVelocity)) + ' uppmätta visningar/tim · Shorts-format ej verifierat'
              : growth === null
              ? 'Tillväxt: otillräckligt underlag'
              : number(Math.round(growth)) + ' ' + trend.metric + '/tim'}
          </span>
          <a
            href={trend.url}
            target="_blank"
            rel="noreferrer"
            aria-label={'Öppna källa: ' + trend.title}
          >
            <ExternalLink size={14} />
          </a>
        </div>
        <div className="actions" style={{ marginTop: 14 }}>
          <button
            className="small"
            disabled={busy}
            onClick={() => draft(trend)}
          >
            <Sparkles size={12} style={{ display: 'inline', marginRight: 6 }} />
            AI-manus
          </button>
          <button
            className="small ghost"
            onClick={() =>
              openProject({
                ...newProject(),
                title: trend.title.slice(0, 160),
                sourceUrl: trend.url,
              })
            }
          >
            Skriv eget manus{' '}
            <ChevronRight size={12} style={{ display: 'inline' }} />
          </button>
        </div>
      </div>
    );
  }

  if (user && !workspaceReady)
    return (
      <div className="login">
        <div className="login-card">
          <Brand />
          <div className="eyebrow">SÄKER HÄMTNING AV ARBETSYTA</div>
          <h1>{checking ? 'Läser din arbetsyta…' : 'Arbetsytan kunde inte hämtas.'}</h1>
          <p>Vi visar inte en tom standardarbetsyta när sparade uppgifter inte kunnat läsas.</p>
          {error && <div className="notice error" role="alert">{error}</div>}
          <button className="primary" disabled={checking || busy} onClick={() => act(load)}>
            {busy ? 'Kontrollerar…' : 'Försök igen'}
          </button>
        </div>
      </div>
    );

  if (!user)
    return (
      <div className="login">
        <div className="login-card">
          <Brand />
          <div className="eyebrow">DITT KREATIVA KONTROLLCENTER</div>
          <h1>
            Från första signal
            <br />
            till nästa berättelse.
          </h1>
          <p>
            Samla verkliga källsignaler, utveckla originalmanus och skapa korta
            videor i en gemensam arbetsyta.
          </p>
          <div className="login-list">
            <div>
              <Check size={16} />
              Riktiga källor med spårbara observationer
            </div>
            <div>
              <Check size={16} />
              Privata, sparade manus och inställningar
            </div>
            <div>
              <Check size={16} />
              Animerad MP4-export i 1080 × 1920
            </div>
          </div>
          <div className="notice">
            Första versionen: manuellt arbetsflöde. Social publicering och
            AI-röst är ännu inte anslutna.
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <button
            className="primary"
            disabled={busy || checking}
            onClick={() =>
              act(async () => {
                const result = await auth.signIn();
                setUser(result.user);
                await load();
              })
            }
          >
            {checking ? 'Kontrollerar inloggning…' : 'Logga in till arbetsytan'}{' '}
            <ArrowRight
              size={16}
              style={{ display: 'inline', marginLeft: 12 }}
            />
          </button>
          <p className="smallprint">
            Kontodata kräver inloggning. Inga sociala konton ansluts
            automatiskt.
          </p>
        </div>
      </div>
    );

  return (
    <div className="shell" data-theme={theme}>
      <aside className="sidebar">
        <Brand />
        <div className="workspace">
          <span className="avatar">{(user.name || 'V').slice(0, 1)}</span>
          <div>
            Min arbetsyta
            <br />
            <small>ViralOS • Första versionen</small>
          </div>
        </div>
        <div className="nav-label">KONTROLLCENTER</div>
        <nav aria-label="Kontrollcenter" className="simple-nav">
          <button className={'nav-home ' + (page === 'overview' ? 'active' : '')}
            aria-current={page === 'overview' ? 'page' : undefined}
            onClick={() => { setPage('overview'); setOpenGroup(null); setError(''); }}>
            <LayoutDashboard size={17} /> Översikt
          </button>
          {navigationGroups.map(group => {
            const expanded = openGroup === group.id;
            const active = group.pages.includes(page);
            return <div className="nav-cluster" key={group.id}>
              <button className={'nav-group-toggle ' + (active ? 'group-active' : '')}
                aria-expanded={expanded} aria-controls={'nav-sub-' + group.id}
                onClick={() => setOpenGroup(expanded ? null : group.id)}>
                <group.icon size={17} />
                <span>{group.name}</span>
                <ChevronDown className={'nav-chevron ' + (expanded ? 'expanded' : '')} size={16} />
              </button>
              {expanded && <div className="nav-children" id={'nav-sub-' + group.id}>
                {navigation.filter(item => group.pages.includes(item.id)).map(item =>
                  <button key={item.id} className={'nav-child ' + (page === item.id ? 'active' : '')}
                    aria-current={page === item.id ? 'page' : undefined}
                    onClick={() => { setPage(item.id); setError(''); }}>
                    <item.icon size={15} /> {item.name}
                  </button>
                )}
              </div>}
            </div>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="status-box">
            <strong>
              <span className="dot" style={{ color: '#e9c48c' }} /> MANUELLT
              LÄGE
            </strong>
            <span>
              Automatisk produktion och publicering är inte aktiverade.
            </span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumb">
            Arbetsyta <span>/ {currentNav.name}</span>
          </div>
          <div className="top-actions">
            <span>Europe/Madrid</span>
            <Badge tone="amber">Fas 1 + bakgrundskö</Badge>
            <button
              className="ghost small"
              aria-label="Logga ut"
              onClick={() =>
                act(async () => {
                  invalidate();
                  ++loadGeneration.current;
                  setNarrationFile(null);
                   setNarrationRights(false);
                   await auth.signOut();
                  setUser(null);
                  pendingRecoveryTest.current = false;
                  setWorkspaceReady(false);
                  setState(initialState);
                  setConnections({ youtubeConfigured: false, hnCachedAt: null, hnLastError: null });
                  setPage('overview');
                  setEdit(newProject());
                  setSearch('');
                  setSource('YouTube');
                  setSettings(initialState.settings);
                  setTheme('dark');
                  setOpenGroup(null);
                  aiRequest.current = null;
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                className="ghost small"
                aria-label="Stäng felmeddelande"
                onClick={() => setError('')}
                style={{ float: 'right' }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {busy && (
            <div className="notice" role="status">
              Arbetar… Vänta tills uppgiften är klar.
            </div>
          )}

          {page === 'system-check' && <SystemCheck onSimulateOutage={simulateWorkspaceOutage} />}
          {page === 'trend-lab' && <TrendLab
            trends={state.trends} candidates={state.candidates || []} busy={busy}
            collect={() => collect('youtube')}
            save={id => act(async () => {
              await api.post('/api/candidates', { trendId: id });
              await load(); setToast('Kandidaten sparades.');
            })}
            update={(id, stage, note) => act(async () => {
              await api.post('/api/candidates/' + encodeURIComponent(id), { stage, note });
              await load(); setToast('Kandidaten uppdaterades.');
            })}
            remove={id => act(async () => {
              await api.delete('/api/candidates/' + encodeURIComponent(id));
              await load(); setToast('Kandidaten togs bort.');
            })}
            draft={item => {
              openProject({ ...newProject(), title: item.title.slice(0, 150), sourceUrl: item.url });
              setToast('Skriv ett eget manus. Källan är förifylld.');
            }}
          />}
          {page === 'jobs' && <JobCenter userId={user.userId} aiEnabled={state.settings.aiTrial} youtube={connections.youtubeConfigured} onChange={load} onOpenProject={id => {
          const project = state.projects.find(p => p.id === id);
          if (project) openProject(project);
          else { setPage('studio'); setError('Manuset hittades inte i denna vy. Uppdatera arbetsytan.'); }
        }} />}
          {page === 'overview' && <Dashboard
            state={state} youtube={connections.youtubeConfigured} busy={busy}
            onNavigate={setPage} onOpen={openProject} onNew={() => openProject(newProject())}
            onCollect={() => collect('youtube')} onRefresh={load}
            onProfile={() => act(async () => {
              await api.post('/api/settings', { ...state.settings, language: 'en', contentFocus: 'social-trends' });
              await load(); setToast('Sociala trender + English sparat för ditt konto.');
            })}
            onReview={(project, decision: ScriptReview['decision'], comment) => act(async () => {
              await api.post('/api/projects/' + encodeURIComponent(project.id) + '/review', {
                revision: revisionOf(project), expectedSha256: await scriptHash(project), expectedReviewId: project.review?.id ?? null, decision, comment,
              });
              await load(); setToast('Manusbeslutet är sparat. Ingen produktion eller publicering har startats.');
            })}
          />}
          {page === 'agents' && <AgentTeam
            runs={state.editorialRuns || []} projects={state.projects} onOpenProject={openProject}
            plans={state.managerPlans || []} trends={state.trends}
            paused={state.paused} busy={busy} aiEnabled={state.settings.aiTrial}
            onNavigate={setPage} onCollect={() => collect('youtube')}
            onPlan={() => act(async () => {
              await api.post('/api/manager/plans', { requestId: crypto.randomUUID() });
              await load();
              setToast('Researchplan sparad. Välj en idé att utveckla.');
            })}
            onSelect={(planId, trendId) => act(async () => {
              await api.post('/api/manager/plans/' + encodeURIComponent(planId) + '/select', { trendId });
              await load();
              setToast('Idén är vald. Inget manus har godkänts eller skapats.');
            })}
            onManual={trend => openProject({
              ...newProject(), title: trend.title.slice(0, 160), sourceUrl: trend.url,
            })}
            onAi={trend => draft(trend)}
            onPause={(id, paused) => act(async () => {
              await api.post('/api/agents', { id, paused }); await load();
            })}
          />}

          {page === 'radar' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">SIGNAL INTELLIGENCE</div>
                  <h1>Upptäck det som rör sig.</h1>
                  <p>
                    Inriktning: trender i sociala medier, utan en fast ämnesnisch.
                    Videospråk: {settings.language === 'en' ? 'English' : 'Svenska'}.
                  </p>
                </div>
                <div className="actions">
                  <button disabled={busy} onClick={() => collect('hn')}>
                    <RefreshCw
                      size={14}
                      style={{ display: 'inline', marginRight: 7 }}
                    />
                    Hämta Hacker News
                  </button>
                  <button
                    disabled={busy || !connections.youtubeConfigured}
                    onClick={() => collect('youtube')}
                  >
                    Hämta YouTube
                  </button>
                </div>
              </div>
              <div className="notice">
                Social källa: YouTube. TikTok, Instagram och Facebook är ännu inte
                anslutna. YouTube-listan är ett begränsat popularitetsurval, inte
                alla sociala trender eller en verifierad Shorts-lista. Ämnen som
                musik och spel kan ingå. Hacker News är en kompletterande
                tekniksignal. Arbetsytan uppdateras när en hämtning körs.
              </div>
              <AutoTrendControl youtube={connections.youtubeConfigured} onRefresh={load} />
              <div className="toolbar">
                <input
                  aria-label="Sök källsignaler"
                  placeholder="Sök ämne eller titel…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <select
                  aria-label="Filtrera källa"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                >
                  <option value="all">Alla källor</option>
                  <option>Hacker News</option>
                  <option>YouTube</option>
                </select>
                <small>{filtered.length} signaler</small>
              </div>
              <div className="columns">
                <div className="panel">
                  {filtered.length ? (
                    filtered.map(t => <TrendCard key={t.id} trend={t} />)
                  ) : (
                    <Empty
                      title="Inga signaler här ännu"
                      text="Hämta en datakälla eller ändra din sökning."
                    />
                  )}
                </div>
                <div className="panel">
                  <div className="panel-header">
                    <h2>Så läser du signalerna</h2>
                    <ShieldCheck size={17} />
                  </div>
                  <div className="panel-body">
                    <Badge tone="green">VERIFIERADE OBSERVATIONER</Badge>
                    <p className="smallprint">
                      Titlar, källpoäng och visningar hämtas från respektive
                      officiellt API. Tidpunkten visar när datan observerades.
                    </p>
                    <Badge tone="amber">BEGRÄNSAT UNDERLAG</Badge>
                    <p className="smallprint">
                      Tillväxt beräknas som förändringen mellan första och
                      senaste sparade observation, delad med antal timmar. Minst
                      15 minuter måste skilja dem åt.
                    </p>
                    <p className="smallprint">
                      Trend Score, konkurrens och framtida viralitet visas inte
                      som siffror innan en kalibrerad modell med tillräckligt
                      underlag finns.
                    </p>
                    <p className="smallprint">
                      Senaste servercache:{' '}
                      {connections.hnCachedAt
                        ? date(connections.hnCachedAt)
                        : 'Inväntar första schemalagda hämtningen'}
                      .
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {page === 'studio' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">CREATE / REVIEW / EXPORT</div>
                  <h1>Din nästa berättelse.</h1>
                  <p>
                    Skapa manus och animerade textvideor i MP4-format.
                    AI-språk: {settings.language === 'en' ? 'English' : 'Svenska'}.
                    Tidigare sparade manus behåller sitt innehåll; granska även
                    språket i manuellt redigerad text före export.
                  </p>
                </div>
                <button onClick={() => openProject(newProject())}>
                  <Plus size={14} style={{ display: 'inline' }} /> Nytt manus
                </button>
              </div>
              <div className="notice amber">
                MP4 med originalgrafik och animerad text. Du kan valfritt lägga till
                din egen eller licensierade berättarröst. Automatisk AI-röst och AI-genererade
                filmklipp är ännu inte anslutna. Berättarröst och video sammanfogas lokalt,
                men textscenerna synkas ännu inte ord för ord mot talet.
              </div>
              <div className="studio-grid">
                <div>
                  <div className="panel">
                    <div className="panel-header">
                      <h2>Manus & berättelse</h2>
                      <Badge>
                        {edit.origin === 'ai'
                          ? 'AI-utkast • faktagranska'
                          : 'Eget manus'}
                      </Badge>
                    </div>
                    <div className="panel-body">
                      <label>
                        Titel
                        <input
                          maxLength={160}
                          value={edit.title}
                          placeholder={settings.language === 'en' ? 'Give your video an English title' : 'Ge din video ett namn'}
                          disabled={rendering}
                          onChange={e => {
                            invalidate();
                            setEdit({ ...edit, title: e.target.value });
                          }}
                        />
                      </label>
                      <label>
                        Manus
                        <textarea
                          maxLength={3500}
                          value={edit.script}
                          placeholder={settings.language === 'en' ? 'Write in English. Start with a strong hook, then one idea per paragraph. Use 5–180 words for MP4 export.' : 'Skriv en stark öppning. Fortsätt med en idé per stycke. Använd 5–180 ord för MP4-export.'}
                          disabled={rendering}
                          onChange={e => {
                            invalidate();
                            setEdit({ ...edit, script: e.target.value });
                          }}
                        />
                      </label>
                      <label>
                        Källänk (valfri)
                        <input
                          type="url"
                          value={edit.sourceUrl}
                          placeholder="https://…"
                          disabled={rendering}
                          onChange={e => {
                            invalidate();
                            setEdit({ ...edit, sourceUrl: e.target.value });
                          }}
                        />
                      </label>
                      <div className="actions">
                        <button
                          className="primary"
                          disabled={busy || rendering}
                          onClick={saveProject}
                        >
                          Spara manus
                        </button>
                        <button
                          disabled={!edit.script.trim()}
                          onClick={() =>
                            downloadText(
                              'viralOS-manus.txt',
                              edit.title +
                                '\n\n' +
                                edit.script +
                                '\n\nSource: ' +
                                edit.sourceUrl
                            )
                          }
                        >
                          Exportera text
                        </button>
                        <button
                          disabled={!edit.script.trim()}
                          onClick={() =>
                            downloadText(
                              'composition.json',
                              JSON.stringify(
                                { title: edit.title, script: edit.script },
                                null,
                                2
                              ),
                              'application/json'
                            )
                          }
                        >
                          Exportera komposition
                        </button>
                      </div>
                      <p className="smallprint">
                        Manus sparas på ditt konto. Videofilen skapas lokalt.
                        Inga andras klipp eller musik används.
                      </p>
                    </div>
                  </div>
                  <EditorialWorkflow
                    project={edit}
                    saved={state.projects.find(p => p.id === edit.id) || null}
                    run={(state.editorialRuns || []).find(r =>
                      r.projectId === edit.id && r.revision ===
                      (state.projects.find(p => p.id === edit.id)?.revision ?? 0)) || null}
                    busy={busy || rendering}
                    onRun={(id, revision) => act(async () => {
                      await api.post('/api/projects/' + encodeURIComponent(id) + '/editorial', { revision });
                      await load();
                      setToast('Fyra gratis kontrollsteg dokumenterade för manusversionen.');
                    })}
                    onAttest={(id, revision, runId) => act(async () => {
                      await api.post('/api/projects/' + encodeURIComponent(id) + '/editorial/attest', {
                        revision, runId, factsChecked: true, rightsChecked: true,
                      });
                      await load();
                      setToast('Din manuella kontroll sparades. Manuset är ännu inte godkänt.');
                    })}
                  />
                  <QualityWorkbench
                    project={edit}
                    saved={state.projects.find(p => p.id === edit.id) || null}
                    aiEnabled={state.settings.aiTrial}
                    busy={busy || rendering}
                    onApply={script => {
                      invalidate();
                      setEdit(previous => ({ ...previous, script }));
                      setToast('AI-förslaget finns i redigeraren. Granska och klicka Spara manus om du vill behålla det.');
                    }}
                  />
                  <ShortsPlanPreview project={edit} saved={state.projects.find(p => p.id === edit.id) || null} />
                  <VideoSelfTest disabled={busy || rendering || uploadingReview || state.paused.includes('studio')} style={videoStyle} />
                  <div className="panel" style={{ marginTop: 20 }}>
                    <div className="panel-body">
                      <strong>Återhämtning av privat videoimport</strong>
                      <p className="smallprint">Om uppladdningen avbröts precis efter videokontrollen söker ViralOS efter ett redan sparat, verifierat kvitto på servern. Funktionen startar ingen ny import och ger aldrig rätt att publicera.</p>
                      <button className="small ghost" disabled={busy || rendering || uploadingReview} onClick={recoverIncompleteReviewUpload}>
                        Kontrollera avbruten slutverifiering
                      </button>
                    </div>
                  </div>
                  <section className="panel" style={{ marginTop: 20 }}>
                    <div className="panel-header"><h2>Videostil & scener</h2><Badge>Gratis renderare</Badge></div>
                    <div className="panel-body">
                      <p className="smallprint">Två originalstilar. Inledningen får kortare visningstid och övriga scener anpassas efter textmängden. Inga stockklipp eller externa tjänster används.</p>
                      <label>Visuell stil
                        <select value={videoStyle} disabled={rendering || uploadingReview}
                          onChange={event => { invalidate(); setVideoStyle(event.target.value as VideoStyle); }}>
                          <option value="cinematic">Cinematic – petrol, mjuka rörelser</option>
                          <option value="bold">Bold – stark typografi, snabbare rörelse</option>
                        </select>
                      </label>
                      <p className="smallprint">Undertextfilen matchar videons ungefärliga scen-/texttiming, inte en transkriberad eller taljusterad ljudfil.</p>
                    </div>
                  </section>
                  <div className="panel" style={{ marginTop: 20 }}>
                    <div className="panel-header"><h2>Berättarröst till MP4</h2><Badge>{narrationFile ? 'Ljudfil vald' : 'Valfri'}</Badge></div>
                    <div className="panel-body">
                      <p className="smallprint">Välj ett licensierat ljud (WAV eller MP3 rekommenderas), 15–45 sekunder och högst 12 MiB. Format och AAC-stöd beror på webbläsaren. Inga externa AI-rösttjänster används.</p>
                      <label>Berättarröst (valfri)
                        <input type="file" accept=".wav,.mp3,.m4a,.aac,.ogg,audio/*" disabled={rendering || uploadingReview}
                          onChange={event => {
                            invalidate();
                            setNarrationFile(event.target.files?.[0] || null);
                            setNarrationRights(false);
                          }} />
                      </label>
                      {narrationFile && <>
                        <p className="smallprint">{narrationFile.name} · {(narrationFile.size / 1048576).toFixed(1)} MiB</p>
                        {narrationPreview && <audio controls src={narrationPreview} style={{ width: '100%' }} />}
                        <label className="check"><input type="checkbox" checked={narrationRights}
                          onChange={event => setNarrationRights(event.target.checked)}/>
                          Jag har rätt att använda den här ljudfilen.
                        </label>
                        <button className="small ghost" disabled={rendering || uploadingReview}
                          onClick={() => { invalidate(); setNarrationFile(null); setNarrationRights(false); }}>
                          Ta bort ljudfil
                        </button>
                      </>}
                      <p className="smallprint">Berättarröst kodas som AAC och videons längd följer ljudfilen. Granska alltid textens placering och ljudets synk.</p>
                    </div>
                  </div>
                  <div className="panel" style={{ marginTop: 20 }}>
                    <div className="panel-header">
                      <h2>Sparade projekt</h2>
                      <Badge>{state.projects.length} / 12</Badge>
                    </div>
                    {state.projects.length ? (
                      state.projects.map(p => (
                        <div className="project-item" key={p.id}>
                          <button
                            disabled={rendering}
                            onClick={() => openProject(p)}
                          >
                            {p.title}
                            <small>
                              {date(p.updatedAt)} ·{' '}
                              {p.origin === 'ai' ? 'AI-utkast' : 'Manus'}
                            </small>
                          </button>
                          <button
                            className="small ghost"
                            disabled={busy || rendering}
                            aria-label={'Radera ' + p.title}
                            onClick={() => {
                              if (confirm('Radera manuset ' + p.title + '?'))
                                act(async () => {
                                  await api.delete('/api/projects/' + p.id);
                                  if (p.id === edit.id)
                                    openProject(newProject());
                                  await load();
                                });
                            }}
                          >
                            Radera
                          </button>
                        </div>
                      ))
                    ) : (
                      <Empty
                        title="Ditt första projekt väntar"
                        text="Spara ett manus så hittar du det här även efter att du loggat ut."
                      />
                    )}
                  </div>
                </div>
                <div>
                  <p className="tab-title">
                    {rendered
                      ? 'FÄRDIG MP4'
                      : 'TEXTSKISS • INTE EN FÄRDIG VIDEO'}
                  </p>
                  <div className={'phone ' + (rendered ? 'has-video' : '')}>
                    {rendered ? (
                      <video controls src={rendered.url} />
                    ) : (
                      <p>
                        {edit.script.trim().split('\n')[0]?.slice(0, 170) ||
                          'En stark öppning gör hela skillnaden.'}
                      </p>
                    )}
                  </div>
                  <p className="smallprint">
                    9:16 · 1080 × 1920 · H.264 · 30 FPS · 15–45 sekunder · {rendered ? (rendered.withNarration ? 'AAC-ljud' : 'utan ljud') : (narrationFile ? 'med vald ljudfil' : 'utan ljud')}
                  </p>
                  <button
                    className="primary"
                    style={{ width: '100%' }}
                    disabled={
                      rendering ||
                      busy ||
                      !edit.script.trim() ||
                      state.paused.includes('studio')
                    }
                    onClick={exportVideo}
                  >
                    {rendering ? 'Renderar ' + progress + ' %' : 'Skapa MP4'}
                  </button>
                  {rendering && (
                    <>
                      <div className="progress-track">
                        <div style={{ width: progress + '%' }} />
                      </div>
                      <p className="smallprint" role="status">
                        Låt fliken vara öppen under kodningen.
                      </p>
                    </>
                  )}
                  {rendered && (
                    <div style={{ marginTop: 16 }}>
                      <a href={rendered.url} download="viralOS-video.mp4">
                        <button style={{ width: '100%' }}>
                          <Download
                            size={14}
                            style={{ display: 'inline', marginRight: 6 }}
                          />
                          Ladda ner MP4
                        </button>
                      </a>
                      <button style={{ width: '100%', marginTop: 10 }} onClick={() => downloadText('viralos-video-estimated-DRAFT.srt', rendered.subtitles, 'application/x-subrip;charset=utf-8')}>
                        <Download size={14} style={{ display: 'inline', marginRight: 6 }} />
                        Ladda ner undertexter från MP4-tidslinjen (DRAFT .srt)
                      </button>
                      <button className="primary" style={{ width: '100%', marginTop: 10 }} disabled={uploadingReview || rendering} onClick={saveVideoInPrivateQueue}>
                        {uploadingReview ? 'Lagrar privat MP4 ' + uploadProgress + ' %' : 'Spara i min privata granskningskö'}
                      </button>
                      <button style={{ width: '100%', marginTop: 10 }} onClick={exportReviewPacket}>
                        <ShieldCheck size={14} style={{ display: 'inline', marginRight: 6 }} />
                        Hämta granskningsfil (SHA-256)
                      </button>
                      <button className="small ghost" style={{ width: '100%', marginTop: 8 }} disabled={uploadingReview || busy} onClick={cancelIncompleteReviewUpload}>
                        Avbryt en tidigare ofullständig import
                      </button>
                      <button className="ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setPage('review-inbox')}>
                        Öppna Videogranskning →
                      </button>
                      <div className="notice" style={{ marginTop: 15 }}>
                        Textscenerna i MP4 och den nedladdningsbara SRT-filen har samma tidsindelning. Tal-till-text-synkronisering och rättigheter måste fortfarande granskas manuellt.
                      </div>
                      <div className="notice" style={{ marginTop: 15 }}>
                        Tekniskt verifierat: 1080 × 1920, {rendered.duration}{' '}
                        sekunder, {(rendered.bytes / 1048576).toFixed(1)} MB, {rendered.scenes} scener, stil {rendered.style}. {rendered.mp4Proof.videoTracks} videospår, {rendered.mp4Proof.audioTracks} ljudspår, kontrollerade från filens faktiska MP4-container.
                        {rendered.withNarration ? 'Berättarröst inkluderad (AAC). Kontrollera synk.' : 'Ljudspår saknas avsiktligt.'} Privat lagring kräver ditt uttryckliga klick.
                      </div>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          onChange={e => setReviewed(e.target.checked)}
                        />
                        Jag har granskat texten och videon manuellt.
                      </label>
                      {reviewed && (
                        <Badge tone="green">Granskad i denna session</Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {page === 'review-inbox' && <ReviewInboxPreview loadServerQueue={async () => (await api.get('/api/video-reviews')).data} />}

          {page === 'calendar' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">DISTRIBUTION</div>
                  <h1>Publicera med kontroll.</h1>
                  <p>
                    Nästa fas kopplar godkända videor till dina sociala konton.
                  </p>
                </div>
                <Badge tone="amber">Ej ansluten</Badge>
              </div>
              <div className="notice">
                Inga publiceringar är schemalagda eller aktiverade. Automatisk
                publicering kan inte slås på i denna version.
              </div>
              <div className="grid">
                {[
                  {
                    name: '1. Manusbeslut',
                    text: 'Granska en sparad manusversion i kontrollpanelen. Beslutet tillåter ingen produktion eller publicering.',
                    status: 'Tillgängligt i kontrollpanelen',
                  },
                  {
                    name: '2. Produktion och videogranskning',
                    text: 'Godkänn produktionsplan och kostnad. Granska därefter exakt film med ljud, undertexter och rättighetsunderlag.',
                    status: 'Planerad funktion',
                  },
                  {
                    name: '3. Separat publiceringstillstånd',
                    text: 'Du väljer exakt video, YouTube-kanal, metadata, synlighet och tid. Även privat uppladdning kräver ditt tillstånd. Chefen kan aldrig godkänna åt dig.',
                    status: 'Planerad funktion',
                  },
                ].map(m => (
                  <div className="panel connection" key={m.name}>
                    <CalendarDays color="#8ba6c4" size={25} />
                    <h3>{m.name}</h3>
                    <p>{m.text}</p>
                    <Badge>{m.status}</Badge>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 25 }}>
                <button className="primary" onClick={() => setPage('studio')}>
                  Öppna videostudion
                </button>
                <button
                  className="ghost"
                  onClick={() => setPage('connections')}
                >
                  Se anslutningar →
                </button>
              </div>
            </>
          )}

          {page === 'analytics' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">GROWTH INTELLIGENCE</div>
                  <h1>Resultat som betyder något.</h1>
                  <p>
                    Analysen kommer att baseras på riktiga publiceringsresultat.
                  </p>
                </div>
              </div>
              <div className="panel">
                <Empty
                  title="Inga resultat att analysera ännu"
                  text="Visningar, retention, engagemang och kostnad per video kräver anslutna datakällor. Vi visar inga uppskattade resultat som verklig statistik."
                >
                  <button onClick={() => setPage('connections')}>
                    Se anslutningskrav
                  </button>
                </Empty>
              </div>
              <div className="notice" style={{ marginTop: 20 }}>
                Manuell AI-provning använder leverantörskrediter. Kostnaden per
                anrop rapporteras inte av den aktuella integrationen och är
                därför okänd. Automatisk betald produktion är blockerad.
              </div>
            </>
          )}

          {page === 'connections' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">INTEGRATIONER & KAPACITET</div>
                  <h1>Rätt verktyg. Tydlig status.</h1>
                  <p>
                    Datainsamling, videoproduktion och publicering är separata
                    anslutningar.
                  </p>
                </div>
                <button disabled={busy} onClick={() => act(load)}>
                  <RefreshCw size={14} style={{ display: 'inline' }} />{' '}
                  Kontrollera status
                </button>
              </div>
              <div className="grid">
                <div className="panel connection">
                  <Badge tone="green">IMPLEMENTERAD DATAKÄLLA</Badge>
                  <h3>Hacker News</h3>
                  <p>
                    Officiellt, offentligt API för tekniksignaler. Kräver ingen
                    API-nyckel. Ingen social trendgaranti.
                  </p>
                  <button
                    className="small"
                    disabled={busy}
                    onClick={() => collect('hn')}
                  >
                    Hämta signaler
                  </button>
                  <p>
                    <a
                      href="https://github.com/HackerNews/API"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Officiell dokumentation ↗
                    </a>
                  </p>
                </div>
                <div className="panel connection">
                  <Badge
                    tone={connections.youtubeConfigured ? 'green' : 'amber'}
                  >
                    {connections.youtubeConfigured
                      ? 'Nyckel finns • verifiera med hämtning'
                      : 'Ej ansluten'}
                  </Badge>
                  <h3>YouTube Data API</h3>
                  <p>
                    Insamlingsadapter implementerad. Publicering och Analytics
                    återstår.
                  </p>
                  <ol className="setup">
                    <li>Skapa ett projekt i Google Cloud.</li>
                    <li>Aktivera YouTube Data API v3.</li>
                    <li>Skapa en begränsad API-nyckel.</li>
                    <li>
                      Lägg till YOUTUBE_API_KEY via AppDeploys säkra
                      hemlighetshantering. Dela inte nyckeln i chatten.
                    </li>
                  </ol>
                  <a
                    href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Cloud ↗
                  </a>
                </div>
                <div className="panel connection">
                  <Badge tone="amber">Ej ansluten</Badge>
                  <h3>TikTok</h3>
                  <p>
                    Ingen allmän trendinsamling eller publicering är aktiverad.
                    Direct Post kräver godkännande, redigerbar förhandsvisning
                    och uttryckligt samtycke. Ett verktyg bara för egna konton
                    är inte ett godkänt användningsfall.
                  </p>
                  <a
                    href="https://developers.tiktok.com/docs/en/content-sharing-guidelines"
                    target="_blank"
                    rel="noreferrer"
                  >
                    TikToks aktuella krav ↗
                  </a>
                </div>
                <div className="panel connection">
                  <Badge tone="amber">Ej ansluten</Badge>
                  <h3>Instagram & Facebook</h3>
                  <p>
                    Instagram kräver ett professionellt konto och rätt
                    publiceringsbehörigheter. Facebook-integrationen avser
                    sidor. Meta-app, OAuth och eventuell appgranskning behövs.
                    Dessa adaptrar återstår.
                  </p>
                  <a
                    href="https://developers.facebook.com/documentation/instagram-platform/content-publishing"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Meta for Developers ↗
                  </a>
                </div>
                <div className="panel connection">
                  <Badge tone="green">SERVERINTEGRATION FINNS</Badge>
                  <h3>AI-manus</h3>
                  <p>
                    Aktiveras som begränsad manuell provning i Inställningar.
                    Högst 6 anrop per dag och 30 per månad totalt för appen.
                    Kreditkostnaden är okänd; automatisk produktion är spärrad.
                  </p>
                  <button className="small" onClick={() => setPage('settings')}>
                    Öppna inställningar
                  </button>
                </div>
                <div className="panel connection">
                  <Badge tone="amber">Delvis implementerad</Badge>
                  <h3>Video & röst</h3>
                  <p>
                    Typografisk MP4 kodas i webbläsaren. AI-röst,
                    bild-/videogenerering och separat renderingsworker är inte
                    anslutna. Inga leverantörsnycklar lagras i frontend.
                  </p>
                  <button className="small" onClick={() => setPage('studio')}>
                    Testa MP4-export
                  </button>
                </div>
              </div>
            </>
          )}

          {page === 'settings' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">KONTROLL & RAMAR</div>
                  <h1>Du sätter riktningen.</h1>
                  <p>
                    Inställningarna sparas på ditt konto och gäller din
                    arbetsyta.
                  </p>
                </div>
              </div>
              <section className="panel appearance-settings" style={{ marginBottom: 22 }}>
                <div className="panel-header">
                  <h2>Utseende</h2>
                  <span className="badge">{theme === 'dark' ? 'Mörkt läge' : 'Ljust läge'}</span>
                </div>
                <div className="panel-body">
                  <p>Välj det utseende du föredrar. Ditt val sparas på kontot och följer med när du loggar in igen.</p>
                  <div className="appearance-buttons" role="group" aria-label="Välj färgtema">
                    <button className={theme === 'dark' ? 'primary' : ''} type="button"
                      aria-pressed={theme === 'dark'} disabled={busy} onClick={() => changeTheme('dark')}>
                      <Moon size={17} /> Mörkt
                    </button>
                    <button className={theme === 'light' ? 'primary' : ''} type="button"
                      aria-pressed={theme === 'light'} disabled={busy} onClick={() => changeTheme('light')}>
                      <Sun size={17} /> Ljust
                    </button>
                  </div>
                  <p className="smallprint">Mörkt läge är standard. Detta påverkar bara gränssnittet – inte produktion eller publicering.</p>
                </div>
              </section>
              <div className="columns">
                <div className="panel">
                  <div className="panel-header">
                    <h2>Budget & produktion</h2>
                    <Settings2 size={17} />
                  </div>
                  <div className="panel-body">
                    <div className="notice amber">
                      Budgetvärden sparas för kommande produktion. Betald
                      automatisk produktion är alltid blockerad i denna version.
                      Manuell AI-provning räknas separat i leverantörskrediter
                      och omfattas inte av eurogränserna.
                    </div>
                    <div className="form-grid">
                      <label>
                        Daglig produktionsbudget (EUR)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={settings.dailyBudget}
                          onChange={e =>
                            setSettings({
                              ...settings,
                              dailyBudget: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Månatlig produktionsbudget (EUR)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={settings.monthlyBudget}
                          onChange={e =>
                            setSettings({
                              ...settings,
                              monthlyBudget: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Planerat max videor per dag
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={settings.maxVideos}
                          onChange={e =>
                            setSettings({
                              ...settings,
                              maxVideos: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Manusspråk
                        <select
                          value={settings.language}
                          onChange={e =>
                            setSettings({
                              ...settings,
                              language: e.target.value as 'sv' | 'en',
                            })
                          }
                        >
                          <option value="sv">Svenska</option>
                          <option value="en">English</option>
                        </select>
                      </label>
                      <label>
                        YouTube-region
                        <select
                          value={settings.region}
                          onChange={e =>
                            setSettings({ ...settings, region: e.target.value })
                          }
                        >
                          <option value="SE">Sverige</option>
                          <option value="US">USA</option>
                          <option value="ES">Spanien</option>
                          <option value="GB">Storbritannien</option>
                        </select>
                      </label>
                    </div>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={settings.aiTrial}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            aiTrial: e.target.checked,
                          })
                        }
                      />
                      Aktivera manuell AI-provning. Jag godkänner att varje
                      separat bekräftat anrop använder leverantörskrediter till
                      okänd kostnad, utanför eurobudgeten.
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={settings.stop}
                        onChange={e =>
                          setSettings({ ...settings, stop: e.target.checked })
                        }
                      />
                      Behåll publiceringsspärren. Ingen publicering kan köras i
                      denna version även om spärren tas bort.
                    </label>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await api.post('/api/settings', settings);
                          await load();
                          setToast('Inställningarna är sparade');
                        })
                      }
                    >
                      Spara inställningar
                    </button>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header">
                    <h2>Versionsstatus</h2>
                    <Badge>0.2</Badge>
                  </div>
                  <div className="panel-body">
                    <p className="smallprint">
                      <b>Implementerat:</b> inloggning, avskilda arbetsytor,
                      beständig databas, agentpaus, verkliga källsignaler,
                      manuella manus, AI-provning, bakgrundskö och MP4-kodning.
                    </p>
                    <p className="smallprint">
                      <b>Återstår:</b> återkommande innehållsproduktion,
                      separat renderingsworker, naturlig AI-röst,
                      OAuth-publicering och kostnadsavstämning i euro.
                    </p>
                    <p className="smallprint">
                      Denna version använder AppDeploys transaktionsdatabas.
                      PostgreSQL/Supabase och eve har inte driftsatts.
                      Bakgrundskön bearbetar beställda käll- och manusuppgifter. Social publicering är inte aktiv.
                    </p>
                    <p className="smallprint">
                      Ingen garanti om viralitet eller fullständig
                      GDPR-efterlevnad lämnas. Egna användarvillkor,
                      integritetstext och retention behövs före extern
                      SaaS-lansering.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
