import { FilterPresetId, FilterPreview } from '../types/camera';

export type FilterRecipe = FilterPreview & {
  contrastAmount: number;
  saturationAmount: number;
  warmthAmount: number;
  tintOpacity: number;
  shadowColor: string;
  shadowOpacity: number;
  vignette: number;
};

const identityMatrix = (): number[] => [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

const multiplyColorMatrices = (a: number[], b: number[]) => {
  const out = new Array<number>(20).fill(0);

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const index = row * 5 + col;
      out[index] =
        a[row * 5 + 0] * b[col + 0] +
        a[row * 5 + 1] * b[col + 5] +
        a[row * 5 + 2] * b[col + 10] +
        a[row * 5 + 3] * b[col + 15] +
        (col === 4 ? a[row * 5 + 4] : 0);
    }
  }

  return out;
};

const saturationMatrix = (amount: number) => {
  const r = 0.2126;
  const g = 0.7152;
  const b = 0.0722;
  const inv = 1 - amount;

  return [
    r * inv + amount, g * inv, b * inv, 0, 0,
    r * inv, g * inv + amount, b * inv, 0, 0,
    r * inv, g * inv, b * inv + amount, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

const contrastMatrix = (amount: number) => {
  const offset = 128 * (1 - amount);

  return [
    amount, 0, 0, 0, offset,
    0, amount, 0, 0, offset,
    0, 0, amount, 0, offset,
    0, 0, 0, 1, 0,
  ];
};

const warmthMatrix = (amount: number) => {
  return [
    1 + amount * 0.1, 0, 0, 0, 0,
    0, 1 + amount * 0.02, 0, 0, 0,
    0, 0, 1 - amount * 0.12, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

const composeMatrices = (...matrices: number[][]) =>
  matrices.reduce((current, matrix) => multiplyColorMatrices(matrix, current), identityMatrix());

const recipes: Record<FilterPresetId, FilterRecipe> = {
  soft_portrait: {
    id: 'soft_portrait',
    name: '肤色柔焦 LUT',
    description: '轻提暖调和肤色亮度，让人物更通透柔和。',
    accentColor: '#FFD6BF',
    tintColor: '#F4BC9F',
    contrast: '+8',
    saturation: '+6',
    warmth: '+10',
    contrastAmount: 1.06,
    saturationAmount: 1.05,
    warmthAmount: 0.9,
    tintOpacity: 0.1,
    shadowColor: '#331F2D',
    shadowOpacity: 0.08,
    vignette: 0.18,
  },
  crisp_landscape: {
    id: 'crisp_landscape',
    name: '清透风景 LUT',
    description: '提高清晰感和蓝青层次，压住高光，更利落。',
    accentColor: '#D7EEFF',
    tintColor: '#6FB5E5',
    contrast: '+12',
    saturation: '+10',
    warmth: '-4',
    contrastAmount: 1.1,
    saturationAmount: 1.1,
    warmthAmount: -0.35,
    tintOpacity: 0.08,
    shadowColor: '#102742',
    shadowOpacity: 0.1,
    vignette: 0.14,
  },
  cinematic_street: {
    id: 'cinematic_street',
    name: '街头电影 LUT',
    description: '增加反差和暖冷对比，让纪实画面更有氛围。',
    accentColor: '#E9D0B3',
    tintColor: '#A97558',
    contrast: '+14',
    saturation: '+4',
    warmth: '+2',
    contrastAmount: 1.14,
    saturationAmount: 1.03,
    warmthAmount: 0.2,
    tintOpacity: 0.09,
    shadowColor: '#141A24',
    shadowOpacity: 0.14,
    vignette: 0.22,
  },
  warm_food: {
    id: 'warm_food',
    name: '暖味增强 LUT',
    description: '提升暖色和局部反差，强化食物新鲜感。',
    accentColor: '#FFD4A1',
    tintColor: '#F28B30',
    contrast: '+10',
    saturation: '+12',
    warmth: '+14',
    contrastAmount: 1.08,
    saturationAmount: 1.12,
    warmthAmount: 1.05,
    tintOpacity: 0.12,
    shadowColor: '#3B1F0F',
    shadowOpacity: 0.08,
    vignette: 0.16,
  },
};

export const getFilterRecipe = (presetId: FilterPresetId) => recipes[presetId];

export const getFilterPreview = (presetId: FilterPresetId): FilterPreview => {
  const recipe = recipes[presetId];

  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    accentColor: recipe.accentColor,
    tintColor: recipe.tintColor,
    contrast: recipe.contrast,
    saturation: recipe.saturation,
    warmth: recipe.warmth,
  };
};

export const buildFilterMatrix = (presetId: FilterPresetId) => {
  const recipe = recipes[presetId];

  return composeMatrices(
    saturationMatrix(recipe.saturationAmount),
    contrastMatrix(recipe.contrastAmount),
    warmthMatrix(recipe.warmthAmount)
  );
};
