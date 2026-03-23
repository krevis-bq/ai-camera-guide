import { Platform } from 'react-native';

import { VisionAnalysisPayload } from '../types/camera';

// 智谱GLM-4V API配置
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/callback/vision/glm-4v';
const ZHIPU_API_KEY = process.env.EXPO_PUBLIC_ZHIPU_API_KEY || 'b0792c28ba6a470f90bbb9f08bd00e78.csFQWmlr665jd9Y3';

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_VISION_API_URL) {
    return process.env.EXPO_PUBLIC_VISION_API_URL.replace(/\/+$/, '');
  }
  if (__DEV__ && Platform.OS === 'ios') {
    return 'http://127.0.0.1:3001';
  }
  if (__DEV__ && Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }
  return '';
};

export const hasVisionEndpoint = () => {
  // 开发模式用本地server，生产模式直接用智谱API
  if (__DEV__ && getBaseUrl()) {
    return true;
  }
  // 始终可用，因为可以直接调智谱API
  return true;
};

export const analyzeFrameWithVision = async ({
  imageBase64,
  selectedPoint,
  zoom,
  exposureBias,
}: {
  imageBase64: string;
  selectedPoint: { x: number; y: number };
  zoom: number;
  exposureBias: number;
}): Promise<VisionAnalysisPayload> => {
  const baseUrl = getBaseUrl();

  // 如果有本地server，用本地server
  if (baseUrl) {
    const response = await fetch(`${baseUrl}/vision/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, selectedPoint, zoom, exposureBias }),
    });

    if (!response.ok) {
      throw new Error(await response.text() || '视觉分析服务请求失败');
    }

    return response.json();
  }

  // 直接调用智谱GLM-4V API
  const prompt = `用户当前手机相机参数：
- selectedPoint: (${selectedPoint.x.toFixed(3)}, ${selectedPoint.y.toFixed(3)})
- zoom: ${zoom.toFixed(2)}
- exposureBias: ${exposureBias.toFixed(2)}

请完成：
1. 判断主体和场景类型（portrait/landscape/street/food）。
2. 给出主体真实中心点和主体框。
3. 给出最佳构图点 idealPoint (0-1归一化)。
4. 给出推荐 zoom (0-1) 和曝光建议 (-1到1)。
5. 输出简短中文 instruction、notes、拍摄参数建议和最匹配的滤镜 preset (soft_portrait/crisp_landscape/cinematic_street/warm_food)。
6. 给出0-100的评分。`;

  const response = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4v',
      image: `data:image/jpeg;base64,${imageBase64}`,
      prompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || '智谱视觉分析请求失败');
  }

  const zhipuData = await response.json();
  
  // 解析智谱返回的数据
  // 智谱返回格式: { code: 200, data: { content: "JSON字符串" } }
  let analysisResult;
  if (typeof zhipuData === 'string') {
    analysisResult = JSON.parse(zhipuData);
  } else if (zhipuData.data?.content) {
    analysisResult = typeof zhipuData.data.content === 'string' 
      ? JSON.parse(zhipuData.data.content) 
      : zhipuData.data.content;
  } else if (zhipuData.choices?.length) {
    // OpenAI兼容格式
    analysisResult = JSON.parse(zhipuData.choices[0].message.content);
  } else {
    analysisResult = zhipuData;
  }

  // 确保返回完整的VisionAnalysisPayload
  return {
    model: 'glm-4v',
    confidence: analysisResult.confidence ?? 0.85,
    intent: analysisResult.intent ?? 'street',
    subject: analysisResult.subject ?? null,
    focusPoint: analysisResult.focusPoint ?? selectedPoint,
    idealPoint: analysisResult.idealPoint ?? { x: 0.5, y: 0.45 },
    compositionScore: analysisResult.compositionScore ?? 70,
    framingScore: analysisResult.framingScore ?? 70,
    exposureScore: analysisResult.exposureScore ?? 75,
    overallScore: analysisResult.overallScore ?? 72,
    idealZoom: analysisResult.idealZoom ?? 0.2,
    suggestedExposureBias: analysisResult.suggestedExposureBias ?? 0,
    instruction: analysisResult.instruction ?? '保持当前机位',
    notes: analysisResult.notes ?? ['构图良好', '注意光线'],
    settings: analysisResult.settings ?? {
      lensLabel: '1.0x',
      exposureCompensation: '0 EV',
      iso: 'ISO 100',
      shutter: '1/125s',
      whiteBalance: '5000K',
      detailHint: '保持稳定',
    },
    filterPresetId: analysisResult.filterPresetId ?? 'cinematic_street',
  } as VisionAnalysisPayload;
};