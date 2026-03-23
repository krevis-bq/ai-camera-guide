import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { requestSchema } from './schemas/camera.js';
import { analyzeVision } from './chain/visionChain.js';

dotenv.config();

const port = Number(process.env.PORT || 3001);
const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required in server/.env');
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    model,
    provider: process.env.OPENAI_BASE_URL?.includes('bigmodel') ? 'zhipu' : 'openai',
  });
});

app.post('/vision/analyze', async (req, res) => {
  try {
    const body = requestSchema.parse(req.body);

    const result = await analyzeVision({
      imageBase64: body.imageBase64,
      selectedPointX: body.selectedPoint.x,
      selectedPointY: body.selectedPoint.y,
      zoom: body.zoom,
      exposureBias: body.exposureBias,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    res.status(500).send(message);
  }
});

app.listen(port, () => {
  console.log(`Vision server listening on http://localhost:${port}`);
});
