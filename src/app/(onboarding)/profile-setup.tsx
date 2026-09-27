import { View } from 'react-native';

import { ShellPlaceholder } from '@/components/shell-placeholder';
import { SoulButton } from '@/components/soul-button';
import { signOut } from '@/features/auth/api/auth';
import { layout } from '@/theme';

export default function ProfileSetupRoute() {
  return (
    <View style={{ flex: 1 }}>
      <ShellPlaceholder title="Profile setup" phase={5} />
      <View style={{ padding: layout.screenGutter }}>
        <SoulButton label="Sign out" variant="secondary" block onPress={() => void signOut()} />
      </View>
    </View>
  );
}
