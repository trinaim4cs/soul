import { useLocalSearchParams } from 'expo-router';

import { InstantChatScreen } from '@/features/instant/screens/instant-chat-screen';

export default function InstantChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InstantChatScreen id={id} />;
}
