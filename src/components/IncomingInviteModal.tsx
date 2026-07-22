import { useEffect } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Users } from 'lucide-react-native';

import type { Match } from '../types';
import { tr } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, announce } from '../lib/a11y';

interface IncomingInviteModalProps {
  invite: Match | null;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingInviteModal({
  invite,
  onAccept,
  onDecline,
}: IncomingInviteModalProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  // Announce the incoming invite so screen-reader users notice the modal.
  useEffect(() => {
    if (invite) {
      announce(tr(language, 'Nouveau défi ! Vous avez été invité à jouer.', 'New challenge! You have been invited to play.'));
    }
  }, [invite, language]);

  return (
    <Modal visible={!!invite} animationType="fade" transparent onRequestClose={onDecline}>
      <View
        style={{
          flex: 1, justifyContent: 'center', alignItems: 'center',
          paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.4)',
        }}
      >
        <View
          style={{
            width: '90%', maxWidth: 400,
            backgroundColor: c.card,
            borderRadius: 16, padding: 20,
            borderWidth: 1, borderColor: c.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
            flexDirection: 'column', alignItems: 'center',
          }}
        >
          <View
            style={{ backgroundColor: c.accent, padding: 12, borderRadius: 25, marginBottom: 15 }}
          >
            <Users color="#fff" size={24} />
          </View>
          <Text
            style={{
              fontSize: 18, fontFamily: FONTS.headingBlack,
              color: c.text, marginBottom: 10, textAlign: 'center',
            }}
          >
            {tr(language, 'Nouveau défi !', 'New Challenge!')}
          </Text>
          <Text
            style={{
              fontSize: 14, fontFamily: FONTS.mono,
              color: c.textMuted, marginBottom: 20, textAlign: 'center',
            }}
          >
            {tr(
              language,
              'Vous avez été invité à jouer une partie de GeoG.',
              'You have been invited to play GeoG.',
            )}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
            <TouchableOpacity
              onPress={onDecline}
              {...a11yButton(tr(language, 'Refuser', 'Decline'))}
              style={{
                flex: 1, padding: 15,
                backgroundColor: c.surface,
                borderRadius: 12, alignItems: 'center',
                borderWidth: 1, borderColor: c.border,
              }}
            >
              <Text style={{ color: c.textMuted, fontFamily: FONTS.monoBold }}>
                {tr(language, 'Refuser', 'Decline')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onAccept}
              {...a11yButton(tr(language, 'Accepter', 'Accept'))}
              style={{
                flex: 1, padding: 15,
                backgroundColor: '#2a6e3f',
                borderRadius: 12, alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontFamily: FONTS.monoBold }}>
                {tr(language, 'Accepter', 'Accept')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
