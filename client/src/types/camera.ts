export type NormalizedPoint = {
  x: number;
  y: number;
};

export type NormalizedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SceneIntent = 'portrait' | 'landscape' | 'street' | 'food';

export type MotionDirection = 'left' | 'right' | 'up' | 'down' | 'steady';

export type AnalysisSource = 'local' | 'vision';

export type FilterPresetId =
  | 'soft_portrait'
  | 'crisp_landscape'
  | 'cinematic_street'
  | 'warm_food';

export type CameraSettings = {
  lensLabel: string;
  exposureCompensation: string;
  iso: string;
  shutter: string;
  whiteBalance: string;
  detailHint: string;
};

export type SubjectDetection = {
  label: string;
  confidence: number;
  center: NormalizedPoint;
  box: NormalizedBox | null;
};

export type FilterPreview = {
  id: FilterPresetId;
  name: string;
  description: string;
  accentColor: string;
  tintColor: string;
  contrast: string;
  saturation: string;
  warmth: string;
};

export type SceneAnalysis = {
  source: AnalysisSource;
  model: string | null;
  confidence: number;
  intent: SceneIntent;
  compositionScore: number;
  framingScore: number;
  exposureScore: number;
  overallScore: number;
  focusPoint: NormalizedPoint;
  idealPoint: NormalizedPoint;
  subject: SubjectDetection | null;
  moveHorizontal: MotionDirection;
  moveVertical: MotionDirection;
  zoomDelta: number;
  idealZoom: number;
  suggestedExposureBias: number;
  instruction: string;
  notes: string[];
  settings: CameraSettings;
  colorGrade: FilterPreview;
};

export type ReviewPhoto = {
  originalUri: string;
  croppedUri: string;
  filteredUri: string;
  width: number;
  height: number;
  analysis: SceneAnalysis;
};

export type VisionAnalysisPayload = {
  model: string | null;
  confidence: number;
  intent: SceneIntent;
  subject: SubjectDetection | null;
  focusPoint: NormalizedPoint;
  idealPoint: NormalizedPoint;
  compositionScore: number;
  framingScore: number;
  exposureScore: number;
  overallScore: number;
  idealZoom: number;
  suggestedExposureBias: number;
  instruction: string;
  notes: string[];
  settings: CameraSettings;
  filterPresetId: FilterPresetId;
};
