import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
        <View>
          <View style={styles.badgeRow}>
            <Text style={styles.eyebrow}>
              {analysis.source === 'vision' ? 'OpenAI Vision' : 'Local Fallback'}
            </Text>
            {analysis.model ? <Text style={styles.modelTag}>{analysis.model}</Text> : null}
          </View>
          <Text style={styles.title}>{analysis.instruction}</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreValue}>{analysis.overallScore}</Text>
          <Text style={styles.scoreLabel}>建议分</Text>
        </View>
      </View>

      <View style={styles.liveRow}>
        <Pressable onPress={onToggleLive} style={[styles.liveButton, liveEnabled && styles.liveButtonActive]}>
          <Text style={[styles.liveButtonLabel, liveEnabled && styles.liveButtonLabelActive]}>
            {liveEnabled ? '实时引导开' : '实时引导关'}
          </Text>
        </Pressable>
        <Text style={styles.liveStatus}>
          {analyzing ? '正在抓取画面并做视觉分析' : analysis.source === 'vision' ? '已更新为视觉模型结果' : '未连上服务端时自动退回本地建议'}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <MetricCard label="构图" value={analysis.compositionScore} />
        <MetricCard label="机位" value={analysis.framingScore} />
        <MetricCard label="曝光" value={analysis.exposureScore} />
      </View>

      {analysis.subject ? (
        <View style={styles.subjectCard}>
          <Text style={styles.subjectTitle}>主体检测</Text>
          <Text style={styles.subjectValue}>
            {analysis.subject.label} · {(analysis.subject.confidence * 100).toFixed(0)}%
          </Text>
        </View>
      ) : null}

      <Text style={styles.blockTitle}>推荐焦段</Text>
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

      <Text style={styles.blockTitle}>曝光微调</Text>
      <View style={styles.optionRow}>
        {exposureStops.map((stop) => (
          <OptionChip
            key={stop}
            label={`${stop > 0 ? '+' : ''}${stop.toFixed(1)} EV`}
            active={Math.abs(stop - exposureBias) < 0.01}
            recommended={Math.abs(stop - analysis.suggestedExposureBias) < 0.08}
            onPress={() => onExposureChange(stop)}
          />
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
        <InfoCard label="镜头" value={analysis.settings.lensLabel} />
        <InfoCard label="曝光补偿" value={analysis.settings.exposureCompensation} />
        <InfoCard label="快门 / ISO" value={`${analysis.settings.shutter} / ${analysis.settings.iso}`} />
        <InfoCard label="白平衡" value={analysis.settings.whiteBalance} />
        <InfoCard label="滤镜" value={analysis.colorGrade.name} />
      </ScrollView>

      <View style={styles.notesList}>
        {analysis.notes.map((note) => (
          <Text key={note} style={styles.note}>
            {`\u2022 ${note}`}
          </Text>
        ))}
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: 'rgba(14, 16, 21, 0.92)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  eyebrow: {
    color: '#F3C97A',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modelTag: {
    color: '#0D1720',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#6FCBFF',
  },
  title: {
    color: '#FAF7F2',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    maxWidth: 260,
  },
  scoreBadge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#F3C97A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    color: '#13161E',
    fontSize: 26,
    fontWeight: '800',
  },
  scoreLabel: {
    color: '#13161E',
    fontSize: 11,
    fontWeight: '700',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  liveButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#232936',
  },
  liveButtonActive: {
    backgroundColor: '#6FCBFF',
  },
  liveButtonLabel: {
    color: '#E5EAF3',
    fontSize: 12,
    fontWeight: '700',
  },
  liveButtonLabelActive: {
    color: '#0D1720',
  },
  liveStatus: {
    flex: 1,
    color: '#AAB2C0',
    fontSize: 12,
    lineHeight: 17,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    backgroundColor: '#1A1E27',
    alignItems: 'center',
  },
  metricValue: {
    color: '#FAF7F2',
    fontSize: 20,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#99A2B3',
    fontSize: 12,
    marginTop: 4,
  },
  subjectCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(111, 203, 255, 0.18)',
  },
  subjectTitle: {
    color: '#8EA6B7',
    fontSize: 12,
    marginBottom: 6,
  },
  subjectValue: {
    color: '#F8FBFF',
    fontSize: 15,
    fontWeight: '700',
  },
  blockTitle: {
    color: '#D9DFEA',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#232936',
  },
  optionChipActive: {
    backgroundColor: '#F3C97A',
  },
  optionChipRecommended: {
    borderWidth: 1,
    borderColor: '#6FCBFF',
  },
  optionChipLabel: {
    color: '#E5EAF3',
    fontSize: 13,
    fontWeight: '600',
  },
  optionChipLabelActive: {
    color: '#11151B',
  },
  cardRow: {
    gap: 10,
    marginTop: 18,
    paddingRight: 18,
  },
  infoCard: {
    width: 168,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoLabel: {
    color: '#8D97A7',
    fontSize: 12,
    marginBottom: 8,
  },
  infoValue: {
    color: '#FAF7F2',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  notesList: {
    marginTop: 16,
    gap: 6,
  },
  note: {
    color: '#C1C8D5',
    fontSize: 13,
    lineHeight: 19,
  },
});
