import { MultiServerMCPClient } from '@langchain/mcp-adapters';
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

let mcpClient: MultiServerMCPClient | null = null;
let visionTools: ReturnType<MultiServerMCPClient['getTools']> | null = null;

async function getMCPClient(): Promise<MultiServerMCPClient> {
  if (!mcpClient) {
    mcpClient = new MultiServerMCPClient({
      mcpServers: {
        vision: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@z_ai/mcp-server'],
          env: {
            Z_AI_API_KEY: process.env.OPENAI_API_KEY || '',
            Z_AI_MODE: 'ZHIPU',
          },
          restart: {
            enabled: true,
            maxAttempts: 3,
            delayMs: 1000,
          },
        },
      },
      useStandardContentBlocks: true,
    });
  }
  return mcpClient;
}

async function getVisionTools() {
  if (!visionTools) {
    const client = await getMCPClient();
    visionTools = client.getTools();
  }
  return visionTools;
}

export async function analyzeVision(
  input: VisionChainInput
): Promise<VisionChainOutput> {
  const tools = await getVisionTools();

  // Find the General Image Analysis tool
  const imageAnalysisTool = tools.find(
    (tool: { name?: string }) => tool.name === 'general_image_analysis'
  );

  if (!imageAnalysisTool) {
    throw new Error('General Image Analysis tool not found in MCP server');
  }

  // Call the MCP vision tool with the image
  const imageData = `data:image/jpeg;base64,${input.imageBase64}`;

  const toolResult = await imageAnalysisTool.invoke({
    image: imageData,
    prompt: USER_PROMPT_TEMPLATE
      .replace('{selectedPointX}', input.selectedPointX.toFixed(3))
      .replace('{selectedPointY}', input.selectedPointY.toFixed(3))
      .replace('{zoom}', input.zoom.toFixed(2))
      .replace('{exposureBias}', input.exposureBias.toFixed(2)),
  });

  // Parse the result - the tool returns a structured response
  let analysisResult: unknown;

  if (typeof toolResult === 'string') {
    try {
      analysisResult = JSON.parse(toolResult);
    } catch {
      throw new Error('Failed to parse MCP tool result: ' + toolResult);
    }
  } else if (toolResult && typeof toolResult === 'object' && 'content' in toolResult) {
    // MCP response format with content blocks
    const content = (toolResult as { content: Array<{ text?: string }> }).content;
    if (content && content[0]?.text) {
      try {
        analysisResult = JSON.parse(content[0].text);
      } catch {
        analysisResult = content[0].text;
      }
    }
  } else {
    analysisResult = toolResult;
  }

  // If the result is a string, try to parse it as JSON
  if (typeof analysisResult === 'string') {
    try {
      analysisResult = JSON.parse(analysisResult);
    } catch {
      throw new Error('Failed to parse analysis result: ' + analysisResult);
    }
  }

  // Validate and return the result using responseSchema
  const validated = responseSchema.parse(analysisResult);
  return validated as VisionChainOutput;
}

// Cleanup function to close MCP client
export async function cleanup() {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
    visionTools = null;
  }
}
