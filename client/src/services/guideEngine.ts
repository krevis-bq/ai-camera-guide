import {
  FilterPresetId,
  MotionDirection,
  NormalizedPoint,
  SceneAnalysis,
  SceneIntent,
  VisionAnalysisPayload,
} from '../types/camera';
import { getFilterPreview } from './filterPresets';

const intentAnchors: Record<SceneIntent, NormalizedPoint[]> = {
  portrait: [
    { x: 0.38, y: 0.34 },
    { x: 0.62, y: 0.34 },
  ],
  landscape: [
    { x: 0.33, y: 0.42 },
    { x: 0.67, y: 0.42 },
  ],
  street: [
    { x: 0.33, y: 0.38 },
    { x: 0.67, y: 0.38 },
    { x: 0.33, y: 0.62 },
    { x: 0.67, y: 0.62 },
  ],
  food: [
    { x: 0.5, y: 0.44 },
    { x: 0.5, y: 0.5 },
  ],
};

const intentZoom: Record<SceneIntent, number> = {
  portrait: 0.26,
  landscape: 0.08,
  street: 0.16,
  food: 0.22,
};

const intentExposure: Record<SceneIntent, number> = {
  portrait: 0.3,
  landscape: -0.3,
  street: 0,
  food: 0.2,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const roundScore = (value: number) => Math.round(clamp(value, 0, 1) * 100);

const distance = (a: NormalizedPoint, b: NormalizedPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const inferIntent = (focusPoint: NormalizedPoint, zoom: number): SceneIntent => {
  if (focusPoint.y > 0.62) {
    return 'food';
  }

  if (zoom > 0.22) {
    return 'portrait';
  }

  if (zoom < 0.12 && Math.abs(focusPoint.x - 0.5) > 0.16) {
    return 'landscape';
  }

  return 'street';
};

const pickIdealPoint = (intent: SceneIntent, focusPoint: NormalizedPoint) => {
  const anchors = intentAnchors[intent];

  return anchors.reduce((best, anchor) => {
    if (distance(anchor, focusPoint) < distance(best, focusPoint)) {
      return anchor;
    }

    return best;
  }, anchors[0]);
};

export const directionFromDelta = (
  delta: number,
  positive: MotionDirection,
  negative: MotionDirection
): MotionDirection => {
  if (Math.abs(delta) < 0.04) {
    return 'steady';
  }

  return delta > 0 ? positive : negative;
};

const formatMove = (
  horizontal: MotionDirection,
  vertical: MotionDirection,
  zoomDelta: number
) => {
  const parts: string[] = [];

  if (horizontal !== 'steady') {
    parts.push(horizontal === 'left' ? '向左平移' : '向右平移');
  }

  if (vertical !== 'steady') {
    parts.push(vertical === 'up' ? '轻抬机位' : '微降机位');
  }

  if (Math.abs(zoomDelta) > 0.03) {
    parts.push(zoomDelta > 0 ? '轻微拉近' : '稍微回退');
  }

  return parts.length > 0 ? parts.join('，') : '保持机位';
};

const buildSettings = (intent: SceneIntent, zoom: number, exposureBias: number) => {
  switch (intent) {
    case 'portrait':
      return {
        lensLabel: `${(1 + zoom * 3).toFixed(1)}x 中近景`,
        exposureCompensation: exposureBias <= 0 ? '+0.3 EV' : '+0.7 EV',
        iso: 'ISO 80-160',
        shutter: '1/125s',
        whiteBalance: '5200K 偏暖',
        detailHint: '优先保留肤色层次，避免背景高光溢出',
      };
    case 'landscape':
      return {
        lensLabel: `${(1 + zoom * 2).toFixed(1)}x 广角`,
        exposureCompensation: '-0.3 EV',
        iso: 'ISO 50-100',
        shutter: '1/250s',
        whiteBalance: '5600K 日光',
        detailHint: '适度压高光，让天空和地景层次更稳',
      };
    case 'food':
      return {
        lensLabel: `${(1 + zoom * 3.2).toFixed(1)}x 细节特写`,
        exposureCompensation: '+0.2 EV',
        iso: 'ISO 100-200',
        shutter: '1/100s',
        whiteBalance: '4800K 暖食物色',
        detailHint: '让主体亮一点，保留边缘阴影制造体积感',
      };
    default:
      return {
        lensLabel: `${(1 + zoom * 2.6).toFixed(1)}x 环境纪实`,
        exposureCompensation: '0 EV',
        iso: 'ISO 100-320',
        shutter: '1/160s',
        whiteBalance: '5000K 中性',
        detailHint: '优先稳住快门，保证抓拍成功率',
      };
  }
};

const defaultFilterPreset = (intent: SceneIntent): FilterPresetId => {
  switch (intent) {
    case 'portrait':
      return 'soft_portrait';
    case 'landscape':
      return 'crisp_landscape';
    case 'food':
      return 'warm_food';
    default:
      return 'cinematic_street';
  }
};

export const analyzeSceneLocally = ({
  focusPoint,
  zoom,
  exposureBias,
}: {
  focusPoint: NormalizedPoint;
  zoom: number;
  exposureBias: number;
}): SceneAnalysis => {
  const intent = inferIntent(focusPoint, zoom);
  const idealPoint = pickIdealPoint(intent, focusPoint);
  const idealZoom = intentZoom[intent];
  const zoomDelta = idealZoom - zoom;
  const deltaX = idealPoint.x - focusPoint.x;
  const deltaY = idealPoint.y - focusPoint.y;
  const moveHorizontal = directionFromDelta(deltaX, 'left', 'right');
  const moveVertical = directionFromDelta(deltaY, 'up', 'down');
  const framingScore = roundScore(1 - distance(focusPoint, idealPoint) / 0.48);
  const zoomScore = roundScore(1 - Math.abs(zoomDelta) / 0.45);
  const exposureScore = roundScore(1 - Math.abs(exposureBias - intentExposure[intent]) / 1.1);
  const overallScore = Math.round(framingScore * 0.5 + zoomScore * 0.25 + exposureScore * 0.25);
  const filterPresetId = defaultFilterPreset(intent);

  return {
    source: 'local',
    model: null,
    confidence: 0.42,
    intent,
    compositionScore: Math.round((framingScore + zoomScore) / 2),
    framingScore,
    exposureScore,
    overallScore,
    focusPoint,
    idealPoint,
    subject: null,
    moveHorizontal,
    moveVertical,
    zoomDelta,
    idealZoom,
    suggestedExposureBias: intentExposure[intent],
    instruction: `${formatMove(moveHorizontal, moveVertical, zoomDelta)}，点主体可触发更精确的视觉分析`,
    notes: [
      `主体建议落在${idealPoint.x < 0.5 ? '左' : idealPoint.x > 0.5 ? '右' : '中'}${idealPoint.y < 0.45 ? '上' : idealPoint.y > 0.55 ? '下' : '中'}视觉焦点`,
      `推荐焦段 ${(1 + idealZoom * 3).toFixed(1)}x，更符合${intent === 'portrait' ? '人物' : intent === 'landscape' ? '风景' : intent === 'food' ? '食物' : '街拍'}画面张力`,
      buildSettings(intent, zoom, exposureBias).detailHint,
    ],
    settings: buildSettings(intent, zoom, exposureBias),
    colorGrade: getFilterPreview(filterPresetId),
  };
};

export const hydrateVisionAnalysis = ({
  payload,
  zoom,
}: {
  payload: VisionAnalysisPayload;
  zoom: number;
}): SceneAnalysis => {
  const zoomDelta = payload.idealZoom - zoom;
  const moveHorizontal = directionFromDelta(payload.idealPoint.x - payload.focusPoint.x, 'left', 'right');
  const moveVertical = directionFromDelta(payload.idealPoint.y - payload.focusPoint.y, 'up', 'down');

  return {
    source: 'vision',
    model: payload.model,
    confidence: payload.confidence,
    intent: payload.intent,
    compositionScore: payload.compositionScore,
    framingScore: payload.framingScore,
    exposureScore: payload.exposureScore,
    overallScore: payload.overallScore,
    focusPoint: payload.focusPoint,
    idealPoint: payload.idealPoint,
    subject: payload.subject,
    moveHorizontal,
    moveVertical,
    zoomDelta,
    idealZoom: payload.idealZoom,
    suggestedExposureBias: payload.suggestedExposureBias,
    instruction: payload.instruction,
    notes: payload.notes,
    settings: payload.settings,
    colorGrade: getFilterPreview(payload.filterPresetId),
  };
};
