import { StatusBar } from 'expo-status-bar';
import { CameraCapturedPicture, CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GuideOverlay } from './src/components/GuideOverlay';
import { RecommendationPanel } from './src/components/RecommendationPanel';
import { analyzeSceneLocally, hydrateVisionAnalysis } from './src/services/guideEngine';
import { analyzeFrameWithVision, hasVisionEndpoint } from './src/services/visionClient';
import { NormalizedPoint, ReviewPhoto, SceneAnalysis } from './src/types/camera';

const defaultPoint = { x: 0.5, y: 0.48 };
const liveIntervalMs = 3200;

type FacingMode = 'front' | 'back';

// Intent icons (emoji)
const INTENT_ICONS: Record<string, string> = {
  portrait: '👤',
  landscape: '🏞️',
  food: '🍜',
  street: '🏙️',
};

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
  const [liveEnabled, setLiveEnabled] = useState(() => hasVisionEndpoint());
  const [showGuideTip, setShowGuideTip] = useState(true);
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
  const runVisionAnalysisRef = useRef<() => Promise<void>>(async () => {});
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const lastAnalysisTimeRef = useRef(0);
  const focusPointRef = useRef<NormalizedPoint>(focusPoint);
  // Keep ref in sync with state
  useEffect(() => {
    focusPointRef.current = focusPoint;
  }, [focusPoint]);

  const refreshLocalAnalysis = (nextPoint: NormalizedPoint, nextZoom: number, nextExposure: number) => {
    setAnalysis(
      analyzeSceneLocally({
        focusPoint: nextPoint,
        zoom: nextZoom,
        exposureBias: nextExposure,
      })
    );
  };

  runVisionAnalysisRef.current = async () => {
    if (!cameraRef.current || !cameraReady || capturing || reviewPhoto || analysisLockRef.current) {
      return;
    }

    if (!hasVisionEndpoint()) {
      refreshLocalAnalysis(focusPoint, zoom, exposureBias);
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

      if (!frame.base64) {
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
      setAnalysisError(error instanceof Error ? error.message : 'Vision failed');
    } finally {
      setAnalyzing(false);
      analysisLockRef.current = false;
    }
  };

  useEffect(() => {
    if (!liveEnabled || reviewPhoto || !cameraReady || !hasVisionEndpoint()) {
      return;
    }

    const timer = setInterval(() => {
      void runVisionAnalysisRef.current();
    }, liveIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [cameraReady, liveEnabled, reviewPhoto]);

  useEffect(() => {
    if (!liveEnabled || !cameraReady) {
      return;
    }

    const tick = (timestamp: number) => {
      if (timestamp - lastAnalysisTimeRef.current >= 800) {
        lastAnalysisTimeRef.current = timestamp;
        refreshLocalAnalysis(focusPoint, zoom, exposureBias);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [liveEnabled, cameraReady, focusPoint, zoom, exposureBias]);

  const handlePickPoint = (point: NormalizedPoint) => {
    setFocusPoint(point);
    refreshLocalAnalysis(point, zoom, exposureBias);
    if (liveEnabled && hasVisionEndpoint()) {
      void runVisionAnalysisRef.current();
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

  const handleReset = () => {
    setFocusPoint(defaultPoint);
    setZoom(0.16);
    setExposureBias(0);
    setAnalysisError(null);
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

      if (!photo?.uri) {
        throw new Error('Failed to capture photo');
      }

      const safeAnalysis = analysis ?? analyzeSceneLocally({ focusPoint: defaultPoint, zoom: 0.16, exposureBias: 0 });
      const { buildCroppedPhoto } = await import('./src/services/postProcess');
      const cropped = await buildCroppedPhoto({
        uri: photo.uri,
        width: photo.width ?? 0,
        height: photo.height ?? 0,
        analysis: safeAnalysis,
      });

      let filteredUri = cropped.uri;

      try {
        const { renderFilterToFile } = await import('./src/services/skiaFilter');
        const colorGradeId = safeAnalysis?.colorGrade?.id ?? 'neutral';
        if (colorGradeId !== 'neutral') {
          filteredUri = await renderFilterToFile({
            uri: cropped.uri,
            presetId: colorGradeId,
          });
        }
      } catch (error) {
        setSavedMessage('LUT failed, using cropped');
      }

      setReviewPhoto({
        originalUri: photo.uri,
        croppedUri: cropped.uri,
        filteredUri,
        width: photo.width ?? 0,
        height: photo.height ?? 0,
        analysis: safeAnalysis,
      });
      setShowOriginal(false);
    } catch (error) {
      setSavedMessage(error instanceof Error ? error.message : 'Capture failed');
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
          setSavedMessage('No album permission');
          return;
        }
      }

      await MediaLibrary.saveToLibraryAsync(reviewPhoto.filteredUri);
      setSavedMessage('Saved to album');
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
        <Text style={styles.permissionTitle}>Camera access required for real-time visual analysis</Text>
        <Text style={styles.permissionText}>
          Supports real vision models, arrow guidance, and post-capture filter rendering.
        </Text>
        <Pressable onPress={requestPermission} style={styles.primaryButtonSolo}>
          <Text style={styles.primaryButtonLabel}>Allow Access</Text>
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
          <Text style={styles.reviewEyebrow}>{colorGrade?.name ?? 'Default'}</Text>
          <View style={styles.scorePill}>
            <Text style={styles.scorePillValue}>{reviewPhoto.analysis.overallScore}</Text>
          </View>
        </View>

        <View style={styles.reviewFrame}>
          <Image source={{ uri: currentUri }} style={styles.reviewImage} resizeMode="cover" />
        </View>

        <View style={styles.toggleRow}>
          <ToggleButton label="FILM" active={!showOriginal} onPress={() => setShowOriginal(false)} />
          <ToggleButton label="RAW" active={showOriginal} onPress={() => setShowOriginal(true)} />
        </View>

        <View style={styles.gradePanel}>
          <View style={styles.gradeStats}>
            <GradeStat icon="◐" value={colorGrade?.contrast ?? '—'} />
            <GradeStat icon="◑" value={colorGrade?.saturation ?? '—'} />
            <GradeStat icon="◔" value={colorGrade?.warmth ?? '—'} />
          </View>
          {savedMessage ? <Text style={styles.savedMessage}>{savedMessage}</Text> : null}
        </View>

        <View style={styles.reviewActions}>
          <Pressable onPress={() => setReviewPhoto(null)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonLabel}>Back</Text>
          </Pressable>
          <Pressable onPress={handleExport} style={styles.primaryButton}>
            <Text style={styles.primaryButtonLabel}>{exporting ? 'Saving' : 'Save'}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setReviewPhoto(null);
              handleReset();
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonLabel}>Retry</Text>
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

      <SafeAreaView style={styles.overlayShell} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.intentBadge}>
            <Text style={styles.intentBadgeIcon}>
              {INTENT_ICONS[analysis.intent] ?? 'S'}
            </Text>
          </View>
          <View style={styles.topActions}>
            <IconButton
              icon={torchEnabled ? '◐' : '○'}
              active={torchEnabled}
              onPress={() => setTorchEnabled((v) => !v)}
            />
            <IconButton
              icon={facing === 'back' ? '◧' : '◨'}
              onPress={() => setFacing((v) => (v === 'back' ? 'front' : 'back'))}
            />
            {showGuideTip ? (
              <IconButton icon="✕" onPress={() => setShowGuideTip(false)} />
            ) : (
              <IconButton icon="✕" onPress={() => setShowGuideTip(true)} />
            )}
          </View>
        </View>

        <GuideOverlay
          analysis={analysis}
          previewWidth={previewSize.width}
          previewHeight={previewSize.height}
          onPickPoint={handlePickPoint}
          liveEnabled={liveEnabled}
          showGuideTip={showGuideTip}
          onToggleGuideTip={() => setShowGuideTip((v) => !v)}
          focusPointRef={focusPointRef}
        />

        <View style={styles.bottomSheet}>
          <RecommendationPanel
            analysis={analysis}
            zoom={zoom}
            exposureBias={exposureBias}
            liveEnabled={liveEnabled}
            analyzing={analyzing}
            onToggleLive={() => setLiveEnabled((v) => !v)}
            onZoomChange={handleZoomChange}
            onExposureChange={handleExposureChange}
          />

          <View style={styles.captureRow}>
            <View style={styles.captureInfo} />

            <Pressable
              onPress={handleCapture}
              style={[styles.captureButton, capturing && styles.captureButtonDisabled]}
            >
              <View style={styles.captureInner} />
            </Pressable>

            <View style={styles.captureInfo} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function IconButton({ icon, active, onPress, size = 36 }: { icon: string; active?: boolean; onPress: () => void; size?: number }) {
  return (
    <Pressable onPress={onPress} style={[styles.iconButton, active && styles.iconButtonActive, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.iconButtonText, active && styles.iconButtonTextActive]}>{icon}</Text>
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

function GradeStat({ icon, value }: { icon: string; value: string }) {
  return (
    <View style={styles.gradeStat}>
      <Text style={styles.gradeStatIcon}>{icon}</Text>
      <Text style={styles.gradeStatValue}>{value}</Text>
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
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingBottom: 8,
  },
  intentBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentBadgeIcon: {
    fontSize: 20,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
  },
  guideCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
  },
  guideCloseText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: 'rgba(243, 201, 122, 0.2)',
  },
  iconButtonText: {
    color: '#F0EDE6',
    fontSize: 16,
    fontWeight: '400',
  },
  iconButtonTextActive: {
    color: '#F3C97A',
  },
  bottomSheet: {
    paddingBottom: 32,
    paddingTop: 10,
    backgroundColor: 'rgba(5, 6, 8, 0.9)',
    backdropFilter: 'blur(24px)',
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    paddingTop: 20,
  },
  captureButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureInner: {
    width: 0,
    height: 0,
  },
  captureInfo: {
    width: 60,
    alignItems: 'center',
    gap: 2,
  },
  captureInfoText: {
    color: '#555',
    fontSize: 10,
    textAlign: 'center',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  permissionScreen: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  permissionEyebrow: {
    color: '#F3C97A',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  permissionTitle: {
    color: '#FAF7F2',
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    marginBottom: 16,
  },
  permissionText: {
    color: '#666',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 32,
  },
  primaryButtonSolo: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: '#F3C97A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F3C97A',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#F3C97A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F3C97A',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryButtonLabel: {
    color: '#0D1016',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    color: '#999',
    fontSize: 14,
    fontWeight: '600',
  },
  reviewScreen: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: '#000000',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    gap: 16,
  },
  reviewEyebrow: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '600',
  },
  scorePill: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#F3C97A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F3C97A',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  scorePillValue: {
    color: '#0D1016',
    fontSize: 28,
    fontWeight: '800',
  },
  scorePillLabel: {
    color: '#0D1016',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  reviewFrame: {
    marginTop: 24,
    borderRadius: 20,
    overflow: 'hidden',
    aspectRatio: 4 / 5,
    backgroundColor: '#1A1A1A',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  reviewImage: {
    width: '100%',
    height: '100%',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#F3C97A',
  },
  toggleLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  toggleLabelActive: {
    color: '#0D1016',
  },
  gradePanel: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  gradeStats: {
    flexDirection: 'row',
    gap: 24,
  },
  gradeStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  gradeStatIcon: {
    color: '#666',
    fontSize: 18,
  },
  gradeStatValue: {
    color: '#FAF7F2',
    fontSize: 15,
    fontWeight: '600',
  },
  savedMessage: {
    color: '#6FCBFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
});
