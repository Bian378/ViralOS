
import { useState } from 'react';
import type { Candidate, Trend } from './model';

type Props = {
  trends: Trend[]; candidates: Candidate[]; busy: boolean;
  save: (id: string) => void;
  update: (id: string, stage: Candidate['stage'], note: string) => void;
  remove: (id: string) => void;
  draft: (source: Pick<Trend, 'title' | 'url'>) => void;
  collect: () => void;
};
const fmt = (n: number) => new Intl.NumberFormat('sv-SE').format(n);
const date = (s: string) => new Date(s).toLocaleDateString('sv-SE');
const avg = (t: Trend) => {
  const hours = (Date.parse(t.observedAt) - Date.parse(t.publishedAt)) / 3600000;
  return t.source === 'YouTube' && hours > 1 ? Math.round(t.value * 24 / hours) : null;
};
function Saved({ c, busy, update, remove, draft }: {
  c: Candidate; busy: boolean; update: Props['update']; remove: Props['remove']; draft: Props['draft'];
}) {
  const [stage, setStage] = useState<Candidate['stage']>(c.stage);
  const [note, setNote] = useState(c.note);
  return <div className="feed-row">
    <div className="feed-meta"><span className="badge green">{c.source}</span><small>Sparad {date(c.addedAt)}</small></div>
    <h3>{c.title}</h3>
    <p className="smallprint">{fmt(c.value)} {c.metric} (observerat {date(c.observedAt)}, inte live)</p>
    <div className="lab-filters">
      <label>Arbetsstatus<select value={stage} onChange={e => setStage(e.target.value as Candidate['stage'])}>
        <option value="new">Ny kandidat</option><option value="research">Undersöks</option>
        <option value="ready">Redo för manus</option></select></label>
      <label>Research / anteckningar<textarea rows={2} maxLength={600} value={note}
        onChange={e => setNote(e.target.value)} placeholder="Fakta, vinkel, rättigheter…" /></label>
    </div>
    <div className="actions" style={{ flexWrap: 'wrap', marginTop: 14 }}>
      <button className="primary small" disabled={busy || (stage === c.stage && note === c.note)}
        onClick={() => update(c.id, stage, note)}>Spara ändringar</button>
      <button className="small" onClick={() => draft(c)}>Skriv eget manus →</button>
      <a className="lab-link" href={c.url} target="_blank" rel="noopener noreferrer">Öppna källa ↗</a>
      <button className="small ghost" disabled={busy} onClick={() => {
        if (window.confirm('Ta bort sparad kandidat?')) remove(c.id);
      }}>Ta bort</button>
    </div>
  </div>;
}
export default function TrendLab({ trends, candidates, busy, save, update, remove, draft, collect }: Props) {
  const [tab, setTab] = useState<'discover' | 'saved'>('discover');
  const [source, setSource] = useState('YouTube');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'latest' | 'popular' | 'average'>('latest');
  const ids = new Set(candidates.map(c => c.id));
  const visible = trends.filter(t =>
    (source === 'Alla' || t.source === source) &&
    t.title.toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => {
    if (source !== 'Alla' && sort === 'popular') return b.value - a.value;
    if (source === 'YouTube' && sort === 'average') return (avg(b) || 0) - (avg(a) || 0);
    return b.observedAt.localeCompare(a.observedAt);
  });
  return <>
    <div className="page-head">
      <div><div className="eyebrow">YOUTUBE / TRENDRESEARCH</div><h1>Trendlabb</h1>
        <p>Jämför källsignaler, spara idéer och förbered manus på engelska.</p></div>
      <div className="actions">
        <button className={tab === 'discover' ? 'primary' : ''} onClick={() => setTab('discover')}>Utforska</button>
        <button className={tab === 'saved' ? 'primary' : ''} onClick={() => setTab('saved')}>Sparade ({candidates.length})</button>
      </div>
    </div>
    <div className="notice amber">Manuell testfas: detta startar ingen automatisk AI, videoproduktion eller uppladdning.
      Källornas uppgifter verifierar inte Shorts-format, rättigheter eller faktisk trendtillväxt.</div>
    {tab === 'discover' ? <div className="panel">
      <div className="panel-header"><h2>Trendkällor</h2><span className="badge">{visible.length} resultat</span></div>
      <div className="panel-body lab-filters">
        <label>Sök<input value={search} placeholder="Titel/ämne" onChange={e => setSearch(e.target.value)} /></label>
        <label>Källa<select value={source} onChange={e => { setSource(e.target.value); setSort('latest'); }}>
          <option>YouTube</option><option>Hacker News</option><option>Alla</option></select></label>
        <label>Sortera<select value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
          <option value="latest">Senast observerad</option>
          {source !== 'Alla' && <option value="popular">Flest {source === 'YouTube' ? 'visningar' : 'poäng'}</option>}
          {source === 'YouTube' && <option value="average">Historiskt snitt per dygn</option>}
        </select></label>
      </div>
      <p className="panel-body smallprint" style={{ paddingTop: 0 }}>Historiskt snitt = alla visningar dividerat med antal dagar sedan publicering.
        Det är inte uppmätt trendtillväxt. Jämför inte HN-poäng med YouTube-visningar.</p>
      {visible.length ? visible.map(t => <div className="feed-row" key={t.id}>
        <div className="feed-meta"><span className="badge">{t.source}</span><small>Publicerad {date(t.publishedAt)}</small></div>
        <h3>{t.title}</h3>
        <p className="smallprint">{fmt(t.value)} {t.metric} · Observerad {date(t.observedAt)}
          {avg(t) !== null && ' · historiskt snitt ' + fmt(avg(t)!) + ' visningar/dygn'}</p>
        <div className="actions" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          <button className="primary small" disabled={busy || ids.has(t.id) || candidates.length >= 20}
            onClick={() => save(t.id)}>{ids.has(t.id) ? 'Sparad' : 'Spara kandidat'}</button>
          <button className="small" onClick={() => draft(t)}>Skriv eget manus →</button>
          <a className="lab-link" href={t.url} target="_blank" rel="noopener noreferrer">Öppna källa ↗</a>
        </div>
      </div>) : <div className="empty"><h3>Inga signaler i detta urval</h3>
        <button disabled={busy} onClick={collect}>Hämta YouTube-signaler</button></div>}
    </div> : <div className="panel">
      <div className="panel-header"><h2>Sparade idéer</h2><span className="badge">{candidates.length}/20</span></div>
      {candidates.length ? candidates.map(c => <Saved key={c.id + ':' + c.stage + ':' + c.note}
        c={c} busy={busy} update={update} remove={remove} draft={draft} />) :
        <div className="empty"><h3>Inga sparade idéer</h3><p>Spara en källa i fliken Utforska.</p>
          <button onClick={() => setTab('discover')}>Visa trender</button></div>}
    </div>}
  </>;
}
