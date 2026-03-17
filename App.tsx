import { StatusBar } from 'expo-status-bar';
import { CameraCapturedPicture, CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GuideOverlay } from './src/components/GuideOverlay';
import { RecommendationPanel } from './src/components/RecommendationPanel';
import { analyzeSceneLocally, hydrateVisionAnalysis } from './src/services/guideEngine';
import { buildCroppedPhoto } from './src/services/postProcess';
import { renderFilterToFile } from './src/services/skiaFilter';
import { analyzeFrameWithVision, hasVisionEndpoint } from './src/services/visionClient';
import { NormalizedPoint, ReviewPhoto, SceneAnalysis } from './src/types/camera';

const defaultPoint = { x: 0.5, y: 0.48 };
const liveIntervalMs = 3200;

type FacingMode = 'front' | 'back';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<FacingMode>('back');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [zoom, setZoom] = useState(0.16);
  const [exposureBias, setExposureBias] = useState(0);
  const [focusPoint, setFocusPoint] = useState<NormalizedPoint>(defaultPoint);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [capturing, setCapturing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [reviewPhoto, setReviewPhoto] = useState<ReviewPhoto | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SceneAnalysis>(() =>
    analyzeSceneLocally({
      focusPoint: defaultPoint,
      zoom: 0.16,
      exposureBias: 0,
    })
  );
  const cameraRef = useRef<CameraView | null>(null);
  const analysisLockRef = useRef(false);

  const refreshLocalAnalysis = useEffectEvent((nextPoint: NormalizedPoint, nextZoom: number, nextExposure: number) => {
    setAnalysis(
      analyzeSceneLocally({
        focusPoint: nextPoint,
        zoom: nextZoom,
        exposureBias: nextExposure,
      })
    );
  });

  const runVisionAnalysis = useEffectEvent(async () => {
    if (!cameraRef.current || !cameraReady || capturing || reviewPhoto || analysisLockRef.current) {
      return;
    }

    analysisLockRef.current = true;
    setAnalyzing(true);

    try {
      const frame = (await cameraRef.current.takePictureAsync({
        quality: 0.35,
        base64: true,
        skipProcessing: true,
        shutterSound: false,
      })) as CameraCapturedPicture;

      if (!frame.base64 || !hasVisionEndpoint()) {
        refreshLocalAnalysis(focusPoint, zoom, exposureBias);
        return;
      }

      const payload = await analyzeFrameWithVision({
        imageBase64: frame.base64,
        selectedPoint: focusPoint,
        zoom,
        exposureBias,
      });

      setAnalysis(hydrateVisionAnalysis({ payload, zoom }));
      setFocusPoint(payload.focusPoint);
      setAnalysisError(null);
    } catch (error) {
      refreshLocalAnalysis(focusPoint, zoom, exposureBias);
      setAnalysisError(error instanceof Error ? error.message : '视觉分析失败');
    } finally {
      setAnalyzing(false);
      analysisLockRef.current = false;
    }
  });

  useEffect(() => {
    if (!liveEnabled || reviewPhoto || !cameraReady) {
      return;
    }

    const timer = setInterval(() => {
      void runVisionAnalysis();
    }, liveIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [cameraReady, liveEnabled, reviewPhoto, runVisionAnalysis]);

  const handlePickPoint = (point: NormalizedPoint) => {
    setFocusPoint(point);
    refreshLocalAnalysis(point, zoom, exposureBias);
    if (liveEnabled) {
      void runVisionAnalysis();
    }
  };

  const handleZoomChange = (value: number) => {
    setZoom(value);
    refreshLocalAnalysis(focusPoint, value, exposureBias);
  };

  const handleExposureChange = (value: number) => {
    setExposureBias(value);
    refreshLocalAnalysis(focusPoint, zoom, value);
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !cameraReady || capturing) {
      return;
    }

    try {
      setCapturing(true);
      setSavedMessage(null);
      const photo = (await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      })) as CameraCapturedPicture;

      const cropped = await buildCroppedPhoto({
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        analysis,
      });

      const filteredUri = await renderFilterToFile({
        uri: cropped.uri,
        presetId: analysis.colorGrade.id,
      });

      setReviewPhoto({
        originalUri: photo.uri,
        croppedUri: cropped.uri,
        filteredUri,
        width: photo.width,
        height: photo.height,
        analysis,
      });
      setShowOriginal(false);
    } finally {
      setCapturing(false);
    }
  };

  const handleExport = async () => {
    if (!reviewPhoto || exporting) {
      return;
    }

    try {
      setExporting(true);

      if (!mediaPermission?.granted) {
        const result = await requestMediaPermission();

        if (!result.granted) {
          setSavedMessage('未授予相册权限，无法导出');
          return;
        }
      }

      await MediaLibrary.saveToLibraryAsync(reviewPhoto.filteredUri);
      setSavedMessage('已导出到系统相册');
    } finally {
      setExporting(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#F3C97A" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <StatusBar style="light" />
        <Text style={styles.permissionEyebrow}>AI Camera Guide</Text>
        <Text style={styles.permissionTitle}>先授予相机权限，才能做实时视觉分析和机位引导</Text>
        <Text style={styles.permissionText}>
          这版已经支持接入真实视觉模型、箭头式实时引导，以及拍后真实滤镜渲染导出。
        </Text>
        <Pressable onPress={requestPermission} style={styles.primaryButtonSolo}>
          <Text style={styles.primaryButtonLabel}>允许访问相机</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (reviewPhoto) {
    const currentUri = showOriginal ? reviewPhoto.originalUri : reviewPhoto.filteredUri;
    const { colorGrade } = reviewPhoto.analysis;

    return (
      <SafeAreaView style={styles.reviewScreen}>
        <StatusBar style="light" />
        <View style={styles.reviewHeader}>
          <View>
            <Text style={styles.reviewEyebrow}>LUT 渲染完成</Text>
            <Text style={styles.reviewTitle}>{colorGrade.name}</Text>
            <Text style={styles.reviewDescription}>{colorGrade.description}</Text>
          </View>
          <View style={styles.scorePill}>
            <Text style={styles.scorePillValue}>{reviewPhoto.analysis.overallScore}</Text>
            <Text style={styles.scorePillLabel}>得分</Text>
          </View>
        </View>

        <View style={styles.reviewFrame}>
          <Image source={{ uri: currentUri }} style={styles.reviewImage} resizeMode="cover" />
        </View>

        <View style={styles.toggleRow}>
          <ToggleButton label="LUT 成片" active={!showOriginal} onPress={() => setShowOriginal(false)} />
          <ToggleButton label="原图" active={showOriginal} onPress={() => setShowOriginal(true)} />
        </View>

        <View style={styles.gradePanel}>
          <Text style={styles.gradePanelTitle}>滤镜参数</Text>
          <View style={styles.gradeStats}>
            <GradeChip label="Contrast" value={colorGrade.contrast} accentColor={colorGrade.accentColor} />
            <GradeChip label="Saturation" value={colorGrade.saturation} accentColor={colorGrade.accentColor} />
            <GradeChip label="Warmth" value={colorGrade.warmth} accentColor={colorGrade.accentColor} />
          </View>
          <Text style={styles.gradeHint}>
            已先按推荐构图完成裁切，再用 Skia 做真实滤镜像素渲染并导出为 JPEG。
          </Text>
          {savedMessage ? <Text style={styles.savedMessage}>{savedMessage}</Text> : null}
        </View>

        <View style={styles.reviewActions}>
          <Pressable onPress={() => setReviewPhoto(null)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonLabel}>返回相机</Text>
          </Pressable>
          <Pressable onPress={handleExport} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonLabel}>{exporting ? '导出中' : '导出到相册'}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setReviewPhoto(null);
              setFocusPoint(defaultPoint);
              setZoom(0.16);
              setExposureBias(0);
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonLabel}>再次拍摄</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        zoom={zoom}
        enableTorch={torchEnabled}
        animateShutter={false}
        onCameraReady={() => setCameraReady(true)}
        onMountError={() => setCameraReady(false)}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setPreviewSize({ width, height });
        }}
      />

      <SafeAreaView style={styles.overlayShell}>
        <View style={styles.topBar}>
          <View style={styles.intentBadge}>
            <Text style={styles.intentBadgeLabel}>
              {analysis.intent === 'portrait'
                ? '人物'
                : analysis.intent === 'landscape'
                  ? '风景'
                  : analysis.intent === 'food'
                    ? '美食'
                    : '街拍'}
            </Text>
          </View>
          <View style={styles.topActions}>
            <SmallActionButton
              label={torchEnabled ? '补光开' : '补光关'}
              onPress={() => setTorchEnabled((value) => !value)}
            />
            <SmallActionButton
              label={facing === 'back' ? '后摄' : '前摄'}
              onPress={() => setFacing((value) => (value === 'back' ? 'front' : 'back'))}
            />
          </View>
        </View>

        <GuideOverlay
          analysis={analysis}
          previewWidth={previewSize.width}
          previewHeight={previewSize.height}
          onPickPoint={handlePickPoint}
        />

        <View style={styles.bottomSheet}>
          <RecommendationPanel
            analysis={analysis}
            zoom={zoom}
            exposureBias={exposureBias}
            liveEnabled={liveEnabled}
            analyzing={analyzing}
            onToggleLive={() => setLiveEnabled((value) => !value)}
            onZoomChange={handleZoomChange}
            onExposureChange={handleExposureChange}
          />

          <View style={styles.captureRow}>
            <Pressable
              onPress={() => {
                setFocusPoint(defaultPoint);
                setZoom(0.16);
                setExposureBias(0);
                setAnalysisError(null);
              }}
              style={styles.resetButton}
            >
              <Text style={styles.resetButtonLabel}>重置点位</Text>
            </Pressable>

            <Pressable
              onPress={handleCapture}
              style={[styles.captureButton, capturing && styles.captureButtonDisabled]}
            >
              <View style={styles.captureInner} />
            </Pressable>

            <View style={styles.captureInfo}>
              {capturing ? (
                <>
                  <ActivityIndicator color="#F3C97A" />
                  <Text style={styles.captureInfoText}>裁切与 LUT 渲染中</Text>
                </>
              ) : (
                <Text style={styles.captureInfoText}>
                  {analysisError ? '视觉服务异常，已回退本地' : '点主体后拍摄'}
                </Text>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function SmallActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.smallActionButton}>
      <Text style={styles.smallActionLabel}>{label}</Text>
    </Pressable>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.toggleButton, active && styles.toggleButtonActive]}>
      <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function GradeChip({
  label,
  value,
  accentColor,
}: {
  label: string;
  value: string;
  accentColor: string;
}) {
  return (
    <View style={[styles.gradeChip, { borderColor: accentColor }]}>
      <Text style={styles.gradeChipLabel}>{label}</Text>
      <Text style={styles.gradeChipValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  overlayShell: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  intentBadge: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(14, 16, 21, 0.68)',
  },
  intentBadgeLabel: {
    color: '#F3C97A',
    fontWeight: '700',
    fontSize: 14,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
  },
  smallActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(14, 16, 21, 0.68)',
  },
  smallActionLabel: {
    color: '#F7F4EE',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomSheet: {
    paddingBottom: 10,
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  resetButton: {
    width: 92,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(18, 22, 28, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  resetButtonLabel: {
    textAlign: 'center',
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  captureButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: '#F6F3EC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(246, 243, 236, 0.08)',
  },
  captureButtonDisabled: {
    opacity: 0.7,
  },
  captureInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F3C97A',
  },
  captureInfo: {
    width: 92,
    alignItems: 'center',
    gap: 6,
  },
  captureInfoText: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1016',
  },
  permissionScreen: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    backgroundColor: '#0D1016',
  },
  permissionEyebrow: {
    color: '#F3C97A',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  permissionTitle: {
    color: '#FAF7F2',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    marginBottom: 16,
  },
  permissionText: {
    color: '#C3CBD8',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28,
  },
  primaryButtonSolo: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#F3C97A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#F3C97A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    color: '#11161B',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#1C222C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    color: '#F5F1EA',
    fontSize: 15,
    fontWeight: '700',
  },
  reviewScreen: {
    flex: 1,
    paddingHorizontal: 18,
    backgroundColor: '#0E1117',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 12,
  },
  reviewEyebrow: {
    color: '#F3C97A',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  reviewTitle: {
    color: '#FAF7F2',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  reviewDescription: {
    color: '#C7CFDB',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 250,
  },
  scorePill: {
    width: 78,
    height: 78,
    borderRadius: 28,
    backgroundColor: '#F3C97A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePillValue: {
    color: '#11161B',
    fontSize: 28,
    fontWeight: '800',
  },
  scorePillLabel: {
    color: '#11161B',
    fontSize: 12,
    fontWeight: '700',
  },
  reviewFrame: {
    marginTop: 22,
    borderRadius: 28,
    overflow: 'hidden',
    aspectRatio: 4 / 5,
    backgroundColor: '#151A22',
  },
  reviewImage: {
    width: '100%',
    height: '100%',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#1A2029',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#F3C97A',
  },
  toggleLabel: {
    color: '#E6ECF5',
    fontSize: 14,
    fontWeight: '700',
  },
  toggleLabelActive: {
    color: '#11161B',
  },
  gradePanel: {
    marginTop: 16,
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#161B23',
  },
  gradePanelTitle: {
    color: '#FAF7F2',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  gradeStats: {
    flexDirection: 'row',
    gap: 10,
  },
  gradeChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#11161D',
    alignItems: 'center',
  },
  gradeChipLabel: {
    color: '#97A2B3',
    fontSize: 12,
    marginBottom: 6,
  },
  gradeChipValue: {
    color: '#FAF7F2',
    fontSize: 18,
    fontWeight: '700',
  },
  gradeHint: {
    color: '#BFC8D5',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 14,
  },
  savedMessage: {
    color: '#6FCBFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    marginBottom: 16,
  },
});
