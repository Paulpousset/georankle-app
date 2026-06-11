import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Users } from 'lucide-react-native';

import type { Language, Match } from '../types';
import { tr } from '../i18n';

interface IncomingInviteModalProps {
  invite: Match | null;
  isDarkMode: boolean;
  language: Language;
  onAccept: () => void;
  onDecline: () => void;
}

/** Prompts the player to accept or decline a friend's match invitation. */
export function IncomingInviteModal({
  invite,
  isDarkMode,
  language,
  onAccept,
  onDecline,
}: IncomingInviteModalProps) {
  return (
    <Modal visible={!!invite} animationType="slide" transparent onRequestClose={onDecline}>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingTop: 60,
          backgroundColor: 'rgba(0,0,0,0.4)',
        }}
      >
        <View
          style={{
            width: '90%',
            maxWidth: 400,
            backgroundColor: isDarkMode ? '#1e293b' : '#fff',
            borderRadius: 16,
            padding: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 10,
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <View
            style={{ backgroundColor: '#3b82f6', padding: 12, borderRadius: 25, marginBottom: 15 }}
          >
            <Users color="#fff" size={24} />
          </View>
          <Text
            style={{
              fontSize: 18,
              fontWeight: 'bold',
              color: isDarkMode ? '#fff' : '#1e293b',
              marginBottom: 10,
              textAlign: 'center',
            }}
          >
            {tr(language, 'Nouveau défi !', 'New Challenge!')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: isDarkMode ? '#cbd5e1' : '#475569',
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            {tr(
              language,
              'Vous avez été invité à jouer une partie de GeoRankle.',
              'You have been invited to play GeoRankle.',
            )}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
            <TouchableOpacity
              onPress={onDecline}
              style={{
                flex: 1,
                padding: 15,
                backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: isDarkMode ? '#f8fafc' : '#1e293b', fontWeight: 'bold' }}>
                {tr(language, 'Refuser', 'Decline')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onAccept}
              style={{
                flex: 1,
                padding: 15,
                backgroundColor: '#10b981',
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                {tr(language, 'Accepter', 'Accept')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
