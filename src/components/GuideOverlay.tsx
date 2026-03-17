import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NormalizedPoint, SceneAnalysis } from '../types/camera';

type GuideOverlayProps = {
  analysis: SceneAnalysis;
  previewWidth: number;
  previewHeight: number;
  onPickPoint: (point: NormalizedPoint) => void;
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
}: GuideOverlayProps) {
  const progress = useRef(new Animated.Value(0)).current;

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
    <View onStartShouldSetResponder={() => true} onResponderRelease={handlePress} style={StyleSheet.absoluteFill}>
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

      {subjectBox ? (
        <View pointerEvents="none" style={[styles.subjectBox, subjectBox]}>
          <Text style={styles.subjectLabel}>{analysis.subject?.label}</Text>
        </View>
      ) : null}

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

      <View
        pointerEvents="none"
        style={[
          styles.idealPoint,
          dotStyle(analysis.idealPoint, previewWidth, previewHeight),
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.focusPoint,
          dotStyle(analysis.focusPoint, previewWidth, previewHeight),
        ]}
      />

      <View pointerEvents="none" style={styles.callout}>
        <Text style={styles.calloutLabel}>
          {analysis.source === 'vision' ? '视觉模型引导中' : '本地构图推断'}
        </Text>
        <Text style={styles.calloutText}>{analysis.instruction}</Text>
      </View>
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
    borderRightColor: 'rgba(255,255,255,0.14)',
  },
  gridRows: {
    ...StyleSheet.absoluteFillObject,
  },
  gridRow: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  subjectBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(111, 203, 255, 0.92)',
    borderRadius: 16,
    backgroundColor: 'rgba(111, 203, 255, 0.08)',
  },
  subjectLabel: {
    alignSelf: 'flex-start',
    marginTop: -12,
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#6FCBFF',
    color: '#0D1720',
    fontSize: 11,
    fontWeight: '800',
  },
  arrowRail: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#6FCBFF',
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
    backgroundColor: 'rgba(243, 201, 122, 0.18)',
  },
  focusPoint: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  callout: {
    position: 'absolute',
    left: 18,
    top: 72,
    maxWidth: 260,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(10, 12, 16, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  calloutLabel: {
    color: '#F3C97A',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  calloutText: {
    color: '#F7F4EE',
    fontSize: 13,
    lineHeight: 18,
  },
});
