import { Platform } from 'react-native';

import { VisionAnalysisPayload } from '../types/camera';

const trimSlash = (value: string) => value.replace(/\/+$/, '');

const getDefaultBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_VISION_API_URL) {
    return trimSlash(process.env.EXPO_PUBLIC_VISION_API_URL);
  }

  if (Platform.OS === 'ios') {
    return 'http://127.0.0.1:3001';
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }

  return '';
};

export const hasVisionEndpoint = () => Boolean(getDefaultBaseUrl());

export const analyzeFrameWithVision = async ({
  imageBase64,
  selectedPoint,
  zoom,
  exposureBias,
}: {
  imageBase64: string;
  selectedPoint: {
    x: number;
    y: number;
  };
  zoom: number;
  exposureBias: number;
}) => {
  const baseUrl = getDefaultBaseUrl();

  if (!baseUrl) {
    throw new Error('未配置视觉分析服务地址');
  }

  const response = await fetch(`${baseUrl}/vision/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageBase64,
      selectedPoint,
      zoom,
      exposureBias,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || '视觉分析服务请求失败');
  }

  const payload = (await response.json()) as VisionAnalysisPayload;

  return payload;
};
