import './shorts-plan.css';
import { useMemo } from 'react';
import { Clapperboard, Download, ShieldCheck } from 'lucide-react';
import type { Project } from './model';
import { buildShortsProductionPlan } from './shorts-production-plan';
import { createDraftSrt, createProductionBundle, safeProjectFilename } from './subtitle-export';

function downloadText(filename: string, text: string, type: string) {
  // Only invoked by the human clicking an export button; no remote request.
  const objectUrl = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function ShortsPlanPreview({ project, saved }: { project: Project; saved: Project | null }) {
  const hasSavedVersion = Boolean(saved &&
    saved.id === project.id &&
    saved.revision === project.revision &&
    saved.title === project.title &&
    saved.script === project.script &&
    saved.sourceUrl === project.sourceUrl);
  const outcome = useMemo(() => {
    if (!hasSavedVersion) return { plan: null, error: 'Spara den aktuella manusversionen först.' };
    try {
      return { plan: buildShortsProductionPlan({
        projectId: project.id, revision: project.revision ?? 0, title: project.title,
        script: project.script, sourceUrl: project.sourceUrl,
      }), error: null as string | null };
    } catch (e) {
      return { plan: null, error: e instanceof Error ? e.message : 'Kan inte skapa scenplan.' };
    }
  }, [hasSavedVersion, project.id, project.revision, project.title, project.script, project.sourceUrl]);
  return <details className="panel shorts-plan-panel" style={{ marginTop: 20 }}>
    <summary><Clapperboard size={17} /> Scenplan och undertexttiming
      <span className="badge">Gratis · Ingen AI</span>
    </summary>
    <div className="panel-body">
      <p className="smallprint">
        Förhandsberäkning från sparat manus – ingen video, AI-röst, musik eller färdig
        synkroniserad undertext har skapats. Detta är inte ett godkännande för publicering.
      </p>
      {outcome.error && <div className="notice amber" role="status">
        Scenplanen är inte redo: {outcome.error}
      </div>}
      {outcome.plan && <>
        <div className="feed-meta">
          <span className="badge green">{outcome.plan.scenes.length} scener</span>
          <span>{outcome.plan.totalWords} ord</span>
          <span>Ca {Math.round(outcome.plan.estimatedSeconds)} sekunder</span>
          <span>9:16 · 1080 × 1920 · 30 FPS</span>
        </div>
        <div className="actions" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <button className="small" onClick={() => downloadText(
            safeProjectFilename(outcome.plan!.projectId, outcome.plan!.revision, 'srt'),
            createDraftSrt(outcome.plan!), 'application/x-subrip;charset=utf-8')}>
            <Download size={14} style={{ marginRight: 6, display: 'inline' }} />
            Ladda ner preliminära undertexter (.srt)
          </button>
          <button className="small" onClick={() => downloadText(
            safeProjectFilename(outcome.plan!.projectId, outcome.plan!.revision, 'json'),
            JSON.stringify(createProductionBundle(outcome.plan!), null, 2),
            'application/json;charset=utf-8')}>
            <Download size={14} style={{ marginRight: 6, display: 'inline' }} />
            Ladda ner produktionsplan (.json)
          </button>
        </div>
        <p className="smallprint">
          Alla exporter märkta DRAFT. Undertexternas tidpunkter måste kontrolleras mot
          verkligt inläst tal innan export av slutlig video.
        </p>
        <div className="shorts-plan-scenes">
          {outcome.plan.scenes.map(scene => <div className="shorts-plan-scene" key={scene.order}>
            <div className="feed-meta">
              <strong>Scen {scene.order}</strong>
              <span>Start {(scene.startFrame / 30).toFixed(1)} s</span>
              <span>Längd {(scene.durationFrames / 30).toFixed(1)} s</span>
            </div>
            <p>{scene.text}</p>
            <p className="smallprint">
              {scene.captionCues.length} ungefärliga undertextsegment ·
              Bild-/videomaterial och rättigheter är ännu inte valda eller verifierade.
            </p>
          </div>)}
        </div>
      </>}
      <div className="notice" style={{ marginTop: 14 }}>
        <ShieldCheck size={14} style={{ display: 'inline', marginRight: 7 }} />
        Engelskt språk, källor, bildrättigheter, berättarröst och slutlig undertextsynkronisering
        måste granskas separat. Endast en färdig MP4 kan godkännas för publicering.
      </div>
    </div>
  </details>;
}
