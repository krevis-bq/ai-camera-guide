import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

import { NormalizedPoint, SceneAnalysis } from '../types/camera';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const makeCrop = ({
  width,
  height,
  focusPoint,
  idealPoint,
}: {
  width: number;
  height: number;
  focusPoint: NormalizedPoint;
  idealPoint: NormalizedPoint;
}) => {
  const cropWidth = Math.round(width * 0.78);
  const cropHeight = Math.round(height * 0.82);
  const subjectX = focusPoint.x * width;
  const subjectY = focusPoint.y * height;
  let originX = Math.round(subjectX - idealPoint.x * cropWidth);
  let originY = Math.round(subjectY - idealPoint.y * cropHeight);

  originX = clamp(originX, 0, Math.max(0, width - cropWidth));
  originY = clamp(originY, 0, Math.max(0, height - cropHeight));

  return {
    originX,
    originY,
    width: Math.min(cropWidth, width),
    height: Math.min(cropHeight, height),
  };
};

export const buildCroppedPhoto = async ({
  uri,
  width,
  height,
  analysis,
}: {
  uri: string;
  width: number;
  height: number;
  analysis: SceneAnalysis;
}) => {
  const crop = makeCrop({
    width,
    height,
    focusPoint: analysis.focusPoint,
    idealPoint: analysis.idealPoint,
  });

  return manipulateAsync(
    uri,
    [
      { crop },
      {
        resize: {
          width: 1280,
        },
      },
    ],
    {
      compress: 0.92,
      format: SaveFormat.JPEG,
    }
  );
};
