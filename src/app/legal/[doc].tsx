import { Stack, useLocalSearchParams } from 'expo-router';

import { ErrorState } from '@/components/states';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '@/features/auth/legal/documents';
import { LegalDocumentScreen } from '@/features/auth/screens/legal-document-screen';

export default function LegalDocumentRoute() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  if (!doc || !(doc in LEGAL_DOCUMENTS)) {
    return (
      <ErrorState title="Document not found" body="Go back and try again." onRetry={() => {}} />
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <LegalDocumentScreen id={doc as LegalDocumentId} />
    </>
  );
}
