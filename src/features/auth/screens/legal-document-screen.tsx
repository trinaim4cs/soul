import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import {
  DOCUMENTS_ARE_DRAFT,
  DRAFT_LABEL,
  LEGAL_DOCUMENT_ORDER,
  LEGAL_DOCUMENTS,
  type LegalDocumentId,
} from '@/features/auth/legal/documents';
import { layout, sizes, spacing } from '@/theme';

export function LegalDocumentScreen({ id }: { id: LegalDocumentId }) {
  const doc = LEGAL_DOCUMENTS[id];
  const others = LEGAL_DOCUMENT_ORDER.filter((other) => other !== id);
  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        {doc.title}
      </SoulText>
      {DOCUMENTS_ARE_DRAFT ? (
        <SoulText variant="caption" tone="secondary">
          {DRAFT_LABEL}
        </SoulText>
      ) : null}
      <View style={styles.sections}>
        {doc.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <SoulText variant="subheading">{section.heading}</SoulText>
            <SoulText tone="secondary">{section.body}</SoulText>
          </View>
        ))}
      </View>
      <View style={styles.related}>
        <SoulText variant="label" tone="secondary">
          Other policies
        </SoulText>
        {others.map((other) => (
          <PressableScale
            key={other}
            accessibilityRole="link"
            style={styles.link}
            onPress={() => router.replace(`/legal/${other}`)}>
            <SoulText style={styles.linkLabel}>{LEGAL_DOCUMENTS[other].title}</SoulText>
          </PressableScale>
        ))}
      </View>
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  sections: { gap: layout.sectionGap / 2, marginTop: spacing.md },
  section: { gap: spacing.xs, maxWidth: layout.maxTextWidth },
  related: { marginTop: layout.sectionGap, gap: spacing.xxs },
  link: { minHeight: sizes.touchTarget, justifyContent: 'center' },
  linkLabel: { textDecorationLine: 'underline' },
});
