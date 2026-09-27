import type { IconName } from '@/theme';

/** The four main tabs, shared by the native tab bar and the web one (Nav Read, MOBILE-DESIGN.md). */
export const TAB_ITEMS: {
  name: 'index' | 'instant' | 'chats' | 'you';
  label: string;
  icon: IconName;
}[] = [
  { name: 'index', label: 'Discover', icon: 'style' },
  { name: 'instant', label: 'Instant', icon: 'near_me' },
  { name: 'chats', label: 'Chats', icon: 'chat_bubble' },
  { name: 'you', label: 'You', icon: 'person' },
];
