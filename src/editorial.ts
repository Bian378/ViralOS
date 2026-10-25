import type { Project } from './model';
import { revisionOf } from './review';

export type EditorialStage = {
  role: 'Creative Director' | 'Research & Rights' | 'Quality Control' | 'Chefsagent';
  status: 'done' | 'attention' | 'human';
  detail: string;
};
export type EditorialRun = {
  id: string;
  projectId: string;
  revision: number;
  title: string;
  createdAt: string;
  status: 'changes_needed' | 'needs_human_check' | 'ready_for_human_review';
  stages: EditorialStage[];
  checklist: { factsChecked: boolean; rightsChecked: boolean; checkedAt?: string };
};
function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
export function buildEditorialRun(project: Project, id: string, at: string): EditorialRun {
  const paragraphs = project.script.trim().split(/\n\s*\n/).filter(Boolean);
  const words = countWords(project.script);
  const opening = countWords(paragraphs[0] || '');
  const goodLength = words >= 80 && words <= 150;
  const goodParagraphs = paragraphs.length >= 3 && paragraphs.length <= 8;
  const goodOpening = opening >= 3 && opening <= 12;
  const goodFormat = goodLength && goodParagraphs && goodOpening;
  const sourcePresent = Boolean(project.sourceUrl && /^https?:\/\//i.test(project.sourceUrl));
  return {
    id, projectId: project.id, revision: revisionOf(project), title: project.title, createdAt: at,
    status: goodFormat ? 'needs_human_check' : 'changes_needed',
    checklist: { factsChecked: false, rightsChecked: false },
    stages: [
      {
        role: 'Creative Director',
        status: goodOpening && goodParagraphs ? 'done' : 'attention',
        detail: opening + ' ord i inledningen och ' + paragraphs.length +
          ' stycken. ' + (goodOpening && goodParagraphs
            ? 'Öppningens längd och indelningen följer mallen; berättelsens faktiska kvalitet har inte bedömts.'
            : 'Se över en kort första hook (3–12 ord) och 3–8 tydliga stycken.'),
      },
      {
        role: 'Research & Rights',
        status: 'human',
        detail: sourcePresent
          ? 'En källänk är sparad, men varken innehåll, påståenden eller rättigheter har kontrollerats. Bekräfta dessa manuellt.'
          : 'Källänk saknas. Kontrollera faktapåståenden och rätt att använda material manuellt.',
      },
      {
        role: 'Quality Control',
        status: goodFormat ? 'done' : 'attention',
        detail: words + ' ord. ' + (goodFormat
          ? 'Teknisk strukturkontroll klar: 80–150 ord, 3–8 stycken och 3–12 ord i hooken. Språk och fakta ej verifierade.'
          : 'Se över rekommenderat format: 80–150 ord, 3–8 stycken och 3–12 ord i hooken.'),
      },
      {
        role: 'Chefsagent',
        status: 'human',
        detail: goodFormat
          ? 'Formatkontroller klara. Väntar på din faktakontroll, rättighetsgenomgång och separat manusgodkännande.'
          : 'Manusstrukturen behöver förbättras innan nästa manuella kontroll. Inget innehåll är godkänt för publicering.',
      },
    ],
  };
}
export function withHumanChecks(run: EditorialRun, at: string): EditorialRun {
  if (run.status !== 'needs_human_check' && run.status !== 'ready_for_human_review')
    throw new Error('Manusstrukturen måste först förbättras och granskas igen.');
  return {
    ...run,
    status: 'ready_for_human_review',
    checklist: { factsChecked: true, rightsChecked: true, checkedAt: at },
    stages: run.stages.map(stage => stage.role === 'Research & Rights'
      ? { ...stage, status: 'done', detail: 'Kontoinnehavaren har själv intygat att fakta och rättigheter granskats. Ingen oberoende verifiering har utförts.' }
      : stage.role === 'Chefsagent'
        ? { ...stage, status: 'human', detail: 'Underlaget har kontoinnehavarens intygande. Separat manuellt manusgodkännande återstår; ingen video eller uppladdning startas.' }
        : stage),
  };
}
