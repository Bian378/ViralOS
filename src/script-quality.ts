export type QualityReport = {
  revision: number;
  createdAt: string;
  hookFeedback: string;
  structureFeedback: string;
  factFlags: string[];
  revisedScript: string;
};
