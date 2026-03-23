import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NormalizedPoint, SceneAnalysis } from '../types/camera';

type GuideOverlayProps = {
  analysis: SceneAnalysis;
  previewWidth: number;
  previewHeight: number;
  onPickPoint: (point: NormalizedPoint) => void;
  liveEnabled?: boolean;
  showGuideTip?: boolean;
  onToggleGuideTip?: () => void;
  /** Stable ref to current focusPoint, so interval always reads latest value */
  focusPointRef?: React.MutableRefObject<NormalizedPoint>;
};

const dotStyle = (point: NormalizedPoint, width: number, height: number) => ({
  left: point.x * width - 16,
  top: point.y * height - 16,
});

export function GuideOverlay({
  analysis,
  previewWidth,
  previewHeight,
  onPickPoint,
  liveEnabled = false,
  showGuideTip = true,
  onToggleGuideTip,
  focusPointRef,
}: GuideOverlayProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const liveTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;

  const onPickPointRef = useRef(onPickPoint);
  onPickPointRef.current = onPickPoint;

  useEffect(() => {
    if (liveEnabled) {
      liveTickRef.current = setInterval(() => {
        // Use ref to always get latest focusPoint, avoiding stale closure
        const point = focusPointRef?.current ?? analysisRef.current.focusPoint;
        onPickPointRef.current(point);
      }, 1200);
    } else {
      if (liveTickRef.current) {
        clearInterval(liveTickRef.current);
        liveTickRef.current = null;
      }
    }

    return () => {
      if (liveTickRef.current) {
        clearInterval(liveTickRef.current);
        liveTickRef.current = null;
      }
    };
  }, [liveEnabled, focusPointRef]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [progress]);

  const handlePress = (event: GestureResponderEvent) => {
    if (!previewWidth || !previewHeight) {
      return;
    }

    onPickPoint({
      x: Math.min(1, Math.max(0, event.nativeEvent.locationX / previewWidth)),
      y: Math.min(1, Math.max(0, event.nativeEvent.locationY / previewHeight)),
    });
  };

  const arrow = useMemo(() => {
    const startX = analysis.focusPoint.x * previewWidth;
    const startY = analysis.focusPoint.y * previewHeight;
    const endX = analysis.idealPoint.x * previewWidth;
    const endY = analysis.idealPoint.y * previewHeight;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.hypot(deltaX, deltaY);
    const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

    return {
      startX,
      startY,
      distance,
      angle,
    };
  }, [analysis.focusPoint, analysis.idealPoint, previewWidth, previewHeight]);

  const subjectBox = analysis.subject?.box
    ? {
        left: analysis.subject.box.x * previewWidth,
        top: analysis.subject.box.y * previewHeight,
        width: analysis.subject.box.width * previewWidth,
        height: analysis.subject.box.height * previewHeight,
      }
    : null;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Subtle grid */}
      <View pointerEvents="none" style={styles.grid}>
        <View style={styles.gridColumn} />
        <View style={styles.gridColumn} />
        <View style={styles.gridColumn} />
      </View>
      <View pointerEvents="none" style={styles.gridRows}>
        <View style={styles.gridRow} />
        <View style={styles.gridRow} />
        <View style={styles.gridRow} />
      </View>

      {/* Touchable overlay for picking focus point */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handlePress}
      />

      {/* Subject box */}
      {subjectBox ? (
        <View pointerEvents="none" style={[styles.subjectBox, subjectBox]}>
          <View style={styles.subjectLabel}>
            <Text style={styles.subjectLabelText}>{analysis.subject?.label}</Text>
          </View>
        </View>
      ) : null}

      {/* Arrow rail */}
      <View
        pointerEvents="none"
        style={[
          styles.arrowRail,
          {
            left: arrow.startX,
            top: arrow.startY - 1,
            width: Math.max(0, arrow.distance - 26),
            transform: [{ rotate: `${arrow.angle}deg` }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.arrowHead,
          {
            left: arrow.startX,
            top: arrow.startY - 10,
            transform: [
              { rotate: `${arrow.angle}deg` },
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, Math.max(16, arrow.distance - 36)],
                }),
              },
            ],
          },
        ]}
      />

      {/* Ideal point (gold) */}
      <View
        pointerEvents="none"
        style={[
          styles.idealPoint,
          dotStyle(analysis.idealPoint, previewWidth, previewHeight),
        ]}
      />
      {/* Focus point (white) */}
      <View
        pointerEvents="none"
        style={[
          styles.focusPoint,
          dotStyle(analysis.focusPoint, previewWidth, previewHeight),
        ]}
      />

      {/* Callout - frosted glass (no close button, handled in App.tsx topBar) */}
      {showGuideTip ? (
        <View style={[styles.callout, { top: insets.top + 12 }]} pointerEvents="none" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  gridColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.04)',
  },
  gridRows: {
    ...StyleSheet.absoluteFillObject,
  },
  gridRow: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  subjectBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(111, 203, 255, 0.7)',
    borderRadius: 20,
    backgroundColor: 'rgba(111, 203, 255, 0.06)',
    shadowColor: '#6FCBFF',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  subjectLabel: {
    position: 'absolute',
    top: -14,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(111, 203, 255, 0.9)',
  },
  subjectLabelText: {
    color: '#0A0A0A',
    fontSize: 11,
    fontWeight: '700',
  },
  arrowRail: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#6FCBFF',
    shadowColor: '#6FCBFF',
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  arrowHead: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#6FCBFF',
  },
  idealPoint: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F3C97A',
    backgroundColor: 'rgba(243, 201, 122, 0.15)',
    shadowColor: '#F3C97A',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  focusPoint: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#FFF',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  callout: {
    position: 'absolute',
    left: 20,
    top: 100,
    maxWidth: 240,
    paddingLeft: 16,
    paddingRight: 40,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(8, 9, 12, 0.78)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
});
