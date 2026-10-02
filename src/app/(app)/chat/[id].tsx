import { useLocalSearchParams } from 'expo-router';

import { ChatScreen } from '@/features/chat/screens/chat-screen';

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatScreen id={id} />;
}
