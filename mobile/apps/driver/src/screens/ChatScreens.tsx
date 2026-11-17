import React, { useLayoutEffect } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useT } from '@itour/shared';
import { AnnouncementsScreen as SharedAnnouncements, ChatInboxScreen, ChatThreadScreen } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Nav = StackNavigationProp<RootStackParamList>;

/** Chat tab: the inbox; threads and announcements open on the root stack. */
export function ChatTabScreen() {
  const navigation = useNavigation<Nav>();
  return (
    <ChatInboxScreen
      onOpenThread={(conversationId, title) => navigation.navigate('ChatThread', { conversationId, title })}
      onOpenAnnouncements={() => navigation.navigate('Announcements')}
    />
  );
}

/** One conversation; the header shows the other person's name and role. */
export function ChatThreadRoute() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ChatThread'>>();
  const t = useT();
  useLayoutEffect(() => {
    navigation.setOptions({ title: params.title ?? t('chat.title') });
  }, [navigation, params.title, t]);
  return (
    <ChatThreadScreen
      key={params.conversationId}
      conversationId={params.conversationId}
      onHeader={(title, subtitle) => navigation.setOptions({ title: subtitle ? `${title} · ${subtitle}` : title })}
    />
  );
}

export function AnnouncementsRoute() {
  return <SharedAnnouncements />;
}
