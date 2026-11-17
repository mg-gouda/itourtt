import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, useColors } from '@itour/shared';
import { AnnouncementsScreen as SharedAnnouncements, ChatAvatar, ChatInboxScreen, ChatThreadScreen } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { GradientHeader, HeaderIconButton, brandGradient } from '../ui/kit';

type Nav = StackNavigationProp<RootStackParamList>;

/** Chat tab: the inbox; threads and announcements open on the root stack. */
export function ChatTabScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useColors();
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <GradientHeader title={t('chat.title')} />
      <ChatInboxScreen
        onOpenThread={(conversationId, title) => navigation.navigate('ChatThread', { conversationId, title })}
        onOpenAnnouncements={() => navigation.navigate('Announcements')}
      />
    </View>
  );
}

/** Compact gradient bar for chat screens: back, avatar, name and role. */
function ChatBar({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: string }) {
  const navigation = useNavigation<Nav>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={brandGradient(colors)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <HeaderIconButton icon="arrow-back" onPress={() => navigation.goBack()} label="Back" />
      <ChatAvatar name={title} icon={icon} size={40} />
      <View style={styles.flex}>
        <Text style={styles.barTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.barSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </LinearGradient>
  );
}

/** One conversation; the bar shows the other person's name and role. */
export function ChatThreadRoute() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ChatThread'>>();
  const [head, setHead] = useState<{ title: string; subtitle?: string }>({ title: params.title ?? t('chat.title') });
  return (
    <View style={styles.flex}>
      <ChatBar title={head.title} subtitle={head.subtitle} />
      <ChatThreadScreen
        key={params.conversationId}
        conversationId={params.conversationId}
        onHeader={(title, subtitle) => setHead({ title, subtitle })}
      />
    </View>
  );
}

export function AnnouncementsRoute() {
  return (
    <View style={styles.flex}>
      <ChatBar title={t('chat.announcements')} subtitle={t('chat.announcementsHint')} icon="megaphone" />
      <SharedAnnouncements />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 12 },
  barTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  barSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
});
