import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { HumanMessage } from '@langchain/core/messages';
import { responseSchema } from '../schemas/camera.js';

const USER_PROMPT_TEMPLATE = `用户当前手机相机参数：
- selectedPoint: ({selectedPointX}, {selectedPointY})
- zoom: {zoom}
- exposureBias: {exposureBias}

请完成：
1. 判断主体和场景类型。
2. 给出主体真实中心点和主体框。
3. 给出最佳构图点 idealPoint (0-1归一化)。
4. 给出推荐 zoom (0-1) 和曝光建议 (-1到1)。
5. 输出简短中文 instruction、notes、拍摄参数建议和最匹配的滤镜 preset (soft_portrait/crisp_landscape/cinematic_street/warm_food)。
6. 给出0-100的评分。`;

export interface VisionChainInput {
  imageBase64: string;
  selectedPointX: number;
  selectedPointY: number;
  zoom: number;
  exposureBias: number;
}

export interface VisionChainOutput {
  model: string;
  confidence: number;
  intent: 'portrait' | 'landscape' | 'street' | 'food';
  subject: {
    label: string;
    confidence: number;
    center: { x: number; y: number };
    box: { x: number; y: number; width: number; height: number } | null;
  } | null;
  focusPoint: { x: number; y: number };
  idealPoint: { x: number; y: number };
  compositionScore: number;
  framingScore: number;
  exposureScore: number;
  overallScore: number;
  idealZoom: number;
  suggestedExposureBias: number;
  instruction: string;
  notes: string[];
  settings: {
    lensLabel: string;
    exposureCompensation: string;
    iso: string;
    shutter: string;
    whiteBalance: string;
    detailHint: string;
  };
  filterPresetId: 'soft_portrait' | 'crisp_landscape' | 'cinematic_street' | 'warm_food';
}

function createVisionModel() {
  const modelName = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  return new ChatOpenAI({
    model: modelName,
    temperature: 0,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: { baseURL },
  });
}

let modelInstance: ReturnType<typeof createVisionModel> | null = null;

function getModel() {
  if (!modelInstance) {
    modelInstance = createVisionModel();
  }
  return modelInstance;
}

export async function analyzeVision(
  input: VisionChainInput
): Promise<VisionChainOutput> {
  const model = getModel();
  const structuredModel = model.withStructuredOutput(responseSchema);

  const prompt = PromptTemplate.fromTemplate(USER_PROMPT_TEMPLATE);
  const formattedPrompt = await prompt.format({
    selectedPointX: input.selectedPointX.toFixed(3),
    selectedPointY: input.selectedPointY.toFixed(3),
    zoom: input.zoom.toFixed(2),
    exposureBias: input.exposureBias.toFixed(2),
  });

  const imageUrl = `data:image/jpeg;base64,${input.imageBase64}`;

  const result = await structuredModel.invoke([
    new HumanMessage({
      content: [
        { type: 'text', text: formattedPrompt },
        { type: 'image_url', image_url: imageUrl },
      ],
    }),
  ]);

  return result as VisionChainOutput;
}
