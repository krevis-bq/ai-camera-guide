import {
  BlendMode,
  FilterMode,
  ImageFormat,
  MipmapMode,
  Skia,
  TileMode,
} from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';

import { FilterPresetId } from '../types/camera';
import { buildFilterMatrix, getFilterRecipe } from './filterPresets';

const makeColor = (hex: string, opacity = 1) => {
  const sanitized = hex.replace('#', '');
  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);

  return Skia.Color(`rgba(${r}, ${g}, ${b}, ${opacity})`);
};

export const renderFilterToFile = async ({
  uri,
  presetId,
}: {
  uri: string;
  presetId: FilterPresetId;
}) => {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);

  if (!image) {
    throw new Error('Skia 无法解码图片');
  }

  const width = image.width();
  const height = image.height();
  const recipe = getFilterRecipe(presetId);
  const matrix = buildFilterMatrix(presetId);
  const surface = Skia.Surface.MakeOffscreen(width, height);

  if (!surface) {
    throw new Error('Skia 无法创建离屏渲染 Surface');
  }

  const canvas = surface.getCanvas();
  const rect = Skia.XYWHRect(0, 0, width, height);
  const colorPaint = Skia.Paint();
  const tintPaint = Skia.Paint();
  const shadowPaint = Skia.Paint();
  const vignettePaint = Skia.Paint();

  colorPaint.setAntiAlias(true);
  colorPaint.setColorFilter(Skia.ColorFilter.MakeMatrix(matrix));
  canvas.drawImageRectOptions(image, rect, rect, FilterMode.Linear, MipmapMode.None, colorPaint);

  tintPaint.setColor(makeColor(recipe.tintColor, recipe.tintOpacity));
  tintPaint.setBlendMode(BlendMode.SoftLight);
  canvas.drawRect(rect, tintPaint);

  shadowPaint.setColor(makeColor(recipe.shadowColor, recipe.shadowOpacity));
  shadowPaint.setBlendMode(BlendMode.Multiply);
  canvas.drawRect(rect, shadowPaint);

  vignettePaint.setShader(
    Skia.Shader.MakeRadialGradient(
      Skia.Point(width / 2, height / 2),
      Math.max(width, height) * 0.72,
      [makeColor('#000000', 0), makeColor('#000000', recipe.vignette)],
      [0.58, 1],
      TileMode.Clamp
    )
  );
  vignettePaint.setBlendMode(BlendMode.Multiply);
  canvas.drawRect(rect, vignettePaint);

  surface.flush();
  const filteredImage = surface.makeImageSnapshot().makeNonTextureImage();
  const base64 = filteredImage.encodeToBase64(ImageFormat.JPEG, 92);
  const targetUri = `${FileSystem.cacheDirectory}filtered-${presetId}-${Date.now()}.jpg`;

  await FileSystem.writeAsStringAsync(targetUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return targetUri;
};
