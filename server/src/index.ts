import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

dotenv.config();

const port = Number(process.env.PORT || 3001);
const model = process.env.OPENAI_VISION_MODEL || 'gpt-5.4-mini';

const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const boxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

const requestSchema = z.object({
  imageBase64: z.string().min(100),
  selectedPoint: pointSchema,
  zoom: z.number().min(0).max(1),
  exposureBias: z.number().min(-1).max(1),
});

const responseSchema = z.object({
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

const systemPrompt = `
You are a mobile photography vision assistant.
Analyze the provided camera frame and return only structured JSON.

Rules:
- The selectedPoint marks the user's intended subject. If an actual subject is visible nearby, use the actual subject center as focusPoint.
- All coordinates are normalized between 0 and 1.
- Choose intent from portrait, landscape, street, food.
- idealPoint should reflect stronger composition, usually rule-of-thirds or centered food framing.
- idealZoom is a camera zoom value from 0 to 1 for a smartphone camera UI.
- suggestedExposureBias is between -1 and 1.
- Use short, direct Chinese for instruction and notes.
- filterPresetId must be one of: soft_portrait, crisp_landscape, cinematic_street, warm_food.
- Scores are 0 to 100.
`.trim();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required in server/.env');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    model,
  });
});

app.post('/vision/analyze', async (req, res) => {
  try {
    const body = requestSchema.parse(req.body);
    const prompt = `
用户当前手机相机参数：
- selectedPoint: (${body.selectedPoint.x.toFixed(3)}, ${body.selectedPoint.y.toFixed(3)})
- zoom: ${body.zoom.toFixed(2)}
- exposureBias: ${body.exposureBias.toFixed(2)}

请完成：
1. 判断主体和场景类型。
2. 给出主体真实中心点和主体框。
3. 给出最佳构图点 idealPoint。
4. 给出推荐 zoom 和曝光建议。
5. 输出简短中文 instruction、notes、拍摄参数建议和最匹配的滤镜 preset。
`.trim();

    const response = await client.responses.parse({
      model,
      reasoning: {
        effort: 'minimal',
      },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            {
              type: 'input_image',
              image_url: `data:image/jpeg;base64,${body.imageBase64}`,
              detail: 'low',
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(responseSchema, 'camera_scene_analysis'),
      },
    });

    if (!response.output_parsed) {
      throw new Error('Vision response did not contain parsed JSON');
    }

    res.json(response.output_parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    res.status(500).send(message);
  }
});

app.listen(port, () => {
  console.log(`Vision server listening on http://localhost:${port}`);
});
