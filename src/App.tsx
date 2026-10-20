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
  CircleHelp,
  Download,
  ExternalLink,
  Film,
  LayoutDashboard,
  LogOut,
  Pause,
  Play,
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
  agents,
  initialState,
  signalGrowth,
  type Project,
  type Settings,
  type State,
  type Trend,
} from './model';
import { renderMP4 } from './render';
import JobCenter from './JobCenter';

const navigation = [
  { id: 'overview', name: 'Översikt', icon: LayoutDashboard },
  { id: 'agents', name: 'AI-agenter', icon: Bot },
  { id: 'jobs', name: 'Bakgrundsjobb', icon: Activity },
  { id: 'radar', name: 'Trendradar', icon: Radar },
  { id: 'studio', name: 'Videostudio', icon: Film },
  { id: 'calendar', name: 'Publicering', icon: CalendarDays },
  { id: 'analytics', name: 'Analys & tillväxt', icon: BarChart3 },
  { id: 'connections', name: 'Anslutningar', icon: Unplug },
  { id: 'settings', name: 'Inställningar', icon: Settings2 },
];
type Connections = {
  youtubeConfigured: boolean;
  hnCachedAt: string | null;
  hnLastError: string | null;
};
type User = { userId: string; name?: string; email?: string };
type Rendered = { blob: Blob; url: string; duration: number; bytes: number };
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
  const [state, setState] = useState<State>(initialState);
  const [connections, setConnections] = useState<Connections>({
    youtubeConfigured: false,
    hnCachedAt: null,
    hnLastError: null,
  });
  const [page, setPage] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('YouTube');
  const [settings, setSettings] = useState<Settings>(initialState.settings);
  const [edit, setEdit] = useState<Project>(newProject);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const aiRequest = useRef<{ trendId: string; id: string } | null>(null);
  const renderUrl = useRef<string | null>(null);

  async function load() {
    const [workspace, integration] = await Promise.all([
      api.get('/api/state'),
      api.get('/api/integrations'),
    ]);
    setState(workspace.data);
    setSettings(workspace.data.settings);
    setConnections(integration.data);
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
      const result = await api.post('/api/projects', edit);
      setEdit(result.data);
      await load();
      setToast('Manuset är sparat');
    });
  }
  async function exportVideo() {
    setError('');
    setRendering(true);
    setProgress(0);
    invalidate();
    try {
      const result = await renderMP4(edit.script, setProgress);
      renderUrl.current = result.url;
      setRendered(result);
      setToast('MP4 klar. Mått och speltid verifierade i webbläsaren.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRendering(false);
    }
  }
  const filtered = state.trends.filter(
    t =>
      (source === 'all' || t.source === source) &&
      t.title.toLowerCase().includes(search.toLowerCase())
  );
  const currentNav = navigation.find(n => n.id === page)!;

  function TrendCard({ trend }: { trend: Trend }) {
    const growth = signalGrowth(trend);
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
            {growth === null
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
  function AgentPreview() {
    return (
      <div className="panel">
        <div className="panel-header">
          <h2>Agentteamet</h2>
          <Badge>10 roller</Badge>
        </div>
        {agents.slice(4, 9).map(a => (
          <div className="agent-mini" key={a.id}>
            <span className="agent-icon">
              <Bot size={16} />
            </span>
            <div>
              <strong>{a.name.replace('AI ', '')}</strong>
              <small>
                {a.id === 'publishing'
                  ? 'Kräver anslutning'
                  : 'Manuellt arbetsflöde'}
              </small>
            </div>
            <Badge tone={state.paused.includes(a.id) ? 'amber' : ''}>
              {state.paused.includes(a.id) ? 'Pausad' : 'Väntar'}
            </Badge>
          </div>
        ))}
        <div style={{ padding: 15 }}>
          <button className="ghost small" onClick={() => setPage('agents')}>
            Öppna kontrollcenter →
          </button>
        </div>
      </div>
    );
  }

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
    <div className="shell">
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
        <nav>
          {navigation.map(n => (
            <button
              key={n.id}
              className={page === n.id ? 'active' : ''}
              onClick={() => {
                setPage(n.id);
                setError('');
              }}
            >
              <n.icon size={17} />
              {n.name}
            </button>
          ))}
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
                  await auth.signOut();
                  setUser(null);
                  setState(initialState);
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

          {page === 'jobs' && <JobCenter userId={user.userId} aiEnabled={state.settings.aiTrial} youtube={connections.youtubeConfigured} onChange={load} onOpenProject={id => {
          const project = state.projects.find(p => p.id === id);
          if (project) openProject(project);
          else { setPage('studio'); setError('Manuset hittades inte i denna vy. Uppdatera arbetsytan.'); }
        }} />}
        {page === 'overview' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">ÖVERBLICK / DIN ARBETSYTA</div>
                  <h1>Här börjar nästa idé.</h1>
                  <p>
                    Dina signaler, manus och agenter. Samlade på ett ställe.
                  </p>
                </div>
                <button onClick={() => openProject(newProject())}>
                  <Plus
                    size={15}
                    style={{ display: 'inline', marginRight: 7 }}
                  />
                  Nytt videoprojekt
                </button>
              </div>
              <div className="notice">
                <strong>Din innehållsstrategi</strong>
                <p>Trender i sociala medier inom olika ämnen. Titel och manus på engelska för nya AI-videor.</p>
                {state.settings.language === 'en' && state.settings.contentFocus === 'social-trends' ? (
                  <Badge tone="green">Sparat för ditt konto: sociala trender + English</Badge>
                ) : (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => act(async () => {
                      await api.post('/api/settings', {
                        ...state.settings,
                        language: 'en',
                        contentFocus: 'social-trends',
                      });
                      await load();
                      setToast('Din inriktning är sparad: sociala trender + English');
                    })}
                  >
                    Använd sociala trender + English
                  </button>
                )}
              </div>
              <div className="hero">
                <div className="hero-copy">
                  <Badge tone="green">BYGG DITT FÖRSTA ARBETSFLÖDE</Badge>
                  <h2 style={{ marginTop: 15 }}>
                    Från trend till färdig video.
                  </h2>
                  <p>
                    Följ sociala trender inom olika ämnen. Skapa originella
                    videokoncept och manus från verkliga källsignaler.
                  </p>
                  <button
                    className="primary"
                    disabled={busy || !connections.youtubeConfigured}
                    onClick={() => collect('youtube')}
                  >
                    Hämta YouTube-signaler{' '}
                    <ArrowRight
                      size={15}
                      style={{ display: 'inline', marginLeft: 12 }}
                    />
                  </button>
                </div>
                <div className="radar">
                  <Radar />
                </div>
              </div>
              <div className="metrics">
                {[
                  {
                    label: 'Insamlade signaler',
                    value: state.trends.length,
                    sub: 'Från dina hämtade källor',
                    icon: Radar,
                  },
                  {
                    label: 'Sparade manus',
                    value: state.projects.length,
                    sub: 'Beständiga projekt i arbetsytan',
                    icon: Film,
                  },
                  {
                    label: 'Pågående åtgärder',
                    value: busy ? 1 : 0,
                    sub: 'Begärda åtgärder i denna flik',
                    icon: Bot,
                  },
                  {
                    label: 'Publicerade videor',
                    value: '—',
                    sub: 'Ingen publiceringskälla ansluten',
                    icon: BarChart3,
                  },
                ].map(m => (
                  <div className="metric" key={m.label}>
                    <div className="metric-top">
                      {m.label}
                      <m.icon />
                    </div>
                    <div className="metric-number">{m.value}</div>
                    <small>{m.sub}</small>
                  </div>
                ))}
              </div>
              <div className="columns">
                <div className="panel">
                  <div className="panel-header">
                    <h2>Senaste källsignaler</h2>
                    <button
                      className="ghost small"
                      onClick={() => setPage('radar')}
                    >
                      Visa alla →
                    </button>
                  </div>
                  {state.trends.length ? (
                    state.trends
                      .slice(0, 3)
                      .map(t => <TrendCard key={t.id} trend={t} />)
                  ) : (
                    <Empty
                      title="Din radar är redo"
                      text="Hämta aktuella signaler från Hacker News. YouTube kan anslutas med en API-nyckel."
                    >
                      <button onClick={() => setPage('connections')}>
                        Se datakällor
                      </button>
                    </Empty>
                  )}
                  <div className="workflow">
                    <span>01 Källsignal</span>
                    <i>→</i>
                    <span>02 Manus</span>
                    <i>→</i>
                    <span>03 MP4</span>
                    <i>→</i>
                    <span>04 Granskning</span>
                  </div>
                </div>
                <AgentPreview />
              </div>
            </>
          )}

          {page === 'agents' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">AGENT CONTROL CENTER</div>
                  <h1>Tio roller. Ett arbetsflöde.</h1>
                  <p>
                    Aktivera eller pausa uppgifter. En förberedd roll är inte
                    samma sak som en autonom, körande agent.
                  </p>
                </div>
                <Badge tone="amber">Källor → manus i bakgrundskön</Badge>
              </div>
              <div className="grid">
                {agents.map((a, i) => (
                  <div className="panel agent-card" key={a.id}>
                    <div
                      className="actions"
                      style={{ justifyContent: 'space-between', marginTop: 0 }}
                    >
                      <span className="agent-icon">
                        <Bot size={19} />
                      </span>
                      <small>AGENT {String(i + 1).padStart(2, '0')}</small>
                    </div>
                    <h3>{a.name}</h3>
                    <p>{a.role}</p>
                    <div className="agent-details">
                      {a.implemented
                        ? 'Tillgänglig del: manuellt arbetsflöde'
                        : 'Integration / agentlogik återstår'}
                      <br />
                      Bakgrundsuppdrag: se jobbsidan<br />
                      Status och resultat loggas per uppgift
                    </div>
                    <div className="actions">
                      <Badge
                        tone={
                          state.paused.includes(a.id)
                            ? 'amber'
                            : a.implemented
                              ? 'green'
                              : ''
                        }
                      >
                        {state.paused.includes(a.id)
                          ? 'Pausad'
                          : a.implemented
                            ? 'Väntar'
                            : 'Ej ansluten'}
                      </Badge>
                      <button
                        className="small"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await api.post('/api/agents', {
                              id: a.id,
                              paused: !state.paused.includes(a.id),
                            });
                            await load();
                          })
                        }
                      >
                        {state.paused.includes(a.id) ? (
                          <Play size={12} style={{ display: 'inline' }} />
                        ) : (
                          <Pause size={12} style={{ display: 'inline' }} />
                        )}{' '}
                        {state.paused.includes(a.id) ? 'Återuppta' : 'Pausa'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="panel" style={{ marginTop: 24 }}>
                <div className="panel-header">
                  <h2>Arbetsytans händelser</h2>
                  <Activity size={17} />
                </div>
                <div className="panel-body">
                  {state.events.length ? (
                    state.events.map((event, i) => (
                      <div className="log-row" key={event.at + i}>
                        <small>{date(event.at)}</small>
                        {event.text}
                      </div>
                    ))
                  ) : (
                    <p className="smallprint">
                      Inga uppgifter har genomförts ännu.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

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
                MP4-bas: originalgrafik och animerad text, utan ljud. AI-röst
                och genererade filmklipp är ej anslutna. Exporten körs i denna
                webbläsarflik; filen måste laddas ner innan du lämnar sidan.
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
                          onChange={e =>
                            setEdit({ ...edit, sourceUrl: e.target.value })
                          }
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
                    9:16 · 1080 × 1920 · H.264 · 15–45 sekunder · utan ljud
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
                      <div className="notice" style={{ marginTop: 15 }}>
                        Tekniskt verifierat: 1080 × 1920, {rendered.duration}{' '}
                        sekunder, {(rendered.bytes / 1048576).toFixed(1)} MB.
                        Ljudspår saknas avsiktligt.
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
                    name: 'Manual Mode',
                    text: 'Skapa och granska en MP4, ladda ner den och publicera själv i respektive plattform.',
                    status: 'Tillgängligt via export',
                  },
                  {
                    name: 'Semi-Auto Mode',
                    text: 'Automatisk produktion med ditt godkännande före publicering. Kräver worker och plattformsintegration.',
                    status: 'Planerad funktion',
                  },
                  {
                    name: 'Auto Mode',
                    text: 'Endast för godkända plattformar, kategorier och konton. TikTok kräver särskild kontroll och samtycke.',
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
