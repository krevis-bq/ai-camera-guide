import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SceneAnalysis } from '../types/camera';

type RecommendationPanelProps = {
  analysis: SceneAnalysis;
  zoom: number;
  exposureBias: number;
  liveEnabled: boolean;
  analyzing: boolean;
  onToggleLive: () => void;
  onZoomChange: (value: number) => void;
  onExposureChange: (value: number) => void;
};

const zoomStops = [0, 0.08, 0.16, 0.24, 0.34];
const exposureStops = [-0.7, -0.3, 0, 0.3, 0.7];

const formatZoomLabel = (value: number) => `${(1 + value * 3).toFixed(1)}x`;

export function RecommendationPanel({
  analysis,
  zoom,
  exposureBias,
  liveEnabled,
  analyzing,
  onToggleLive,
  onZoomChange,
  onExposureChange,
}: RecommendationPanelProps) {
  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreValue}>{analysis.overallScore}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.metricsRow}>
            <MetricCard label="构" value={analysis.compositionScore} />
            <MetricCard label="位" value={analysis.framingScore} />
            <MetricCard label="光" value={analysis.exposureScore} />
          </View>
        </View>
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.optionGroup}>
          <Text style={styles.blockTitle}>焦段</Text>
          <View style={styles.optionRow}>
            {zoomStops.map((stop) => (
              <OptionChip
                key={stop}
                label={formatZoomLabel(stop)}
                active={Math.abs(stop - zoom) < 0.01}
                recommended={Math.abs(stop - analysis.idealZoom) < 0.05}
                onPress={() => onZoomChange(stop)}
              />
            ))}
          </View>
        </View>

        <View style={styles.optionGroup}>
          <Text style={styles.blockTitle}>曝光</Text>
          <View style={styles.optionRow}>
            {exposureStops.map((stop) => (
              <OptionChip
                key={stop}
                label={`${stop > 0 ? '+' : ''}${stop.toFixed(1)}`}
                active={Math.abs(stop - exposureBias) < 0.01}
                recommended={Math.abs(stop - analysis.suggestedExposureBias) < 0.08}
                onPress={() => onExposureChange(stop)}
              />
            ))}
          </View>
        </View>
      </View>

    </View>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function OptionChip({
  active,
  label,
  recommended,
  onPress,
}: {
  active: boolean;
  label: string;
  recommended: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.optionChip,
        active && styles.optionChipActive,
        recommended && !active && styles.optionChipRecommended,
      ]}
    >
      <Text style={[styles.optionChipLabel, active && styles.optionChipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: 'rgba(10, 12, 16, 0.95)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerRight: {
    flex: 1,
  },
  title: {
    color: '#FAF7F2',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  scoreBadge: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#F3C97A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    color: '#13161E',
    fontSize: 22,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  metricValue: {
    color: '#FAF7F2',
    fontSize: 16,
    fontWeight: '700',
  },
  metricLabel: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
  },
  controlsRow: {
    marginTop: 16,
    gap: 12,
  },
  optionGroup: {
    gap: 6,
  },
  blockTitle: {
    color: '#555',
    fontSize: 11,
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  optionChipActive: {
    backgroundColor: '#F3C97A',
  },
  optionChipRecommended: {
    borderWidth: 1,
    borderColor: 'rgba(111, 203, 255, 0.4)',
  },
  optionChipLabel: {
    color: '#999',
    fontSize: 12,
    fontWeight: '600',
  },
  optionChipLabelActive: {
    color: '#11151B',
  },
  cardRow: {
    gap: 8,
    marginTop: 14,
    paddingRight: 18,
  },
});
