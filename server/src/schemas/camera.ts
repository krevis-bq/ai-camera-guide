import { z } from 'zod';

export const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const boxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export const requestSchema = z.object({
  imageBase64: z.string().min(100),
  selectedPoint: pointSchema,
  zoom: z.number().min(0).max(1),
  exposureBias: z.number().min(-1).max(1),
});

export const responseSchema = z.object({
  model: z.string(),
  confidence: z.number().min(0).max(1),
  intent: z.enum(['portrait', 'landscape', 'street', 'food']),
  subject: z
    .object({
      label: z.string(),
      confidence: z.number().min(0).max(1),
      center: pointSchema,
      box: boxSchema.nullable(),
    })
    .nullable(),
  focusPoint: pointSchema,
  idealPoint: pointSchema,
  compositionScore: z.number().min(0).max(100),
  framingScore: z.number().min(0).max(100),
  exposureScore: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  idealZoom: z.number().min(0).max(1),
  suggestedExposureBias: z.number().min(-1).max(1),
  instruction: z.string(),
  notes: z.array(z.string()).min(2).max(4),
  settings: z.object({
    lensLabel: z.string(),
    exposureCompensation: z.string(),
    iso: z.string(),
    shutter: z.string(),
    whiteBalance: z.string(),
    detailHint: z.string(),
  }),
  filterPresetId: z.enum([
    'soft_portrait',
    'crisp_landscape',
    'cinematic_street',
    'warm_food',
  ]),
});

export type VisionRequest = z.infer<typeof requestSchema>;
export type VisionResponse = z.infer<typeof responseSchema>;
