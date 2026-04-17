import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { validateSolanaAddress } from '../services/heliusService';

// ==================== خدمة جهات الاتصال المحلية ====================
const CONTACTS_STORAGE_KEY = '@meco_contacts';

const getContacts = async () => {
  try {
    const data = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveContacts = async (contacts) => {
  try {
    await AsyncStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
  } catch (error) {
    console.error('Failed to save contacts:', error);
  }
};

// ==================== الشاشة الرئيسية ====================
export default function ContactsScreen({ route }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';
  
  // إذا تم فتح الشاشة في وضع "الاختيار" (من شاشة الإرسال)
  const selectMode = route.params?.selectMode || false;
  const onSelect = route.params?.onSelect || null;

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactAddress, setContactAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [addressError, setAddressError] = useState('');

  const colors = {
    background: isDark ? '#0A0A0F' : '#F2F3F7',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#8E8E93',
    border: isDark ? '#2A2A3E' : '#E5E5EA',
    error: '#EF4444',
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    const data = await getContacts();
    setContacts(data);
    setLoading(false);
  };

  const handleAddContact = () => {
    setEditingContact(null);
    setContactName('');
    setContactAddress('');
    setAddressError('');
    setModalVisible(true);
  };

  const handleEditContact = (contact) => {
    setEditingContact(contact);
    setContactName(contact.name);
    setContactAddress(contact.address);
    setAddressError('');
    setModalVisible(true);
  };

  const handleDeleteContact = (contact) => {
    Alert.alert(
      t('delete_contact'),
      t('delete_contact_confirmation', { name: contact.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            const updated = contacts.filter(c => c.id !== contact.id);
            setContacts(updated);
            await saveContacts(updated);
          },
        },
      ]
    );
  };

  const validateAndSave = async () => {
    if (!contactName.trim()) {
      Alert.alert(t('error'), t('contact_name_required'));
      return;
    }
    if (!contactAddress.trim()) {
      Alert.alert(t('error'), t('contact_address_required'));
      return;
    }

    // التحقق من صحة عنوان Solana
    const validation = await validateSolanaAddress(contactAddress.trim());
    if (!validation.isValid) {
      setAddressError(t('invalid_solana_address'));
      return;
    }

    let updatedContacts;
    if (editingContact) {
      updatedContacts = contacts.map(c =>
        c.id === editingContact.id
          ? { ...c, name: contactName.trim(), address: contactAddress.trim() }
          : c
      );
    } else {
      const newContact = {
        id: Date.now().toString(),
        name: contactName.trim(),
        address: contactAddress.trim(),
      };
      updatedContacts = [...contacts, newContact];
    }

    setContacts(updatedContacts);
    await saveContacts(updatedContacts);
    setModalVisible(false);
  };

  const handleSelectContact = (contact) => {
    if (selectMode && onSelect) {
      onSelect(contact.address);
      navigation.goBack();
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderContactItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.contactCard, { backgroundColor: colors.card }]}
      onPress={() => handleSelectContact(item)}
      activeOpacity={0.7}
    >
      <View style={styles.contactInfo}>
        <View style={[styles.contactAvatar, { backgroundColor: primaryColor + '20' }]}>
          <Text style={[styles.avatarText, { color: primaryColor }]}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.contactDetails}>
          <Text style={[styles.contactName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.contactAddress, { color: colors.textSecondary }]}>
            {item.address.slice(0, 6)}...{item.address.slice(-4)}
          </Text>
        </View>
      </View>
      {!selectMode && (
        <View style={styles.contactActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleEditContact(item)}
          >
            <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleDeleteContact(item)}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* شريط البحث */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
        <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t('search_contacts')}
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery !== '' && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* قائمة جهات الاتصال */}
      <FlatList
        data={filteredContacts}
        renderItem={renderContactItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {searchQuery ? t('no_contacts_found') : t('no_contacts_yet')}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: primaryColor }]}
                onPress={handleAddContact}
              >
                <Text style={styles.addButtonText}>{t('add_first_contact')}</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* زر الإضافة العائم */}
      {!selectMode && contacts.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: primaryColor }]}
          onPress={handleAddContact}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* Modal إضافة/تعديل جهة اتصال */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingContact ? t('edit_contact') : t('add_contact')}
            </Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              {t('contact_name')}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={t('contact_name_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={contactName}
              onChangeText={setContactName}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              {t('contact_address')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: addressError ? colors.error : colors.border, backgroundColor: colors.background }
              ]}
              placeholder={t('contact_address_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={contactAddress}
              onChangeText={(text) => {
                setContactAddress(text);
                setAddressError('');
              }}
              multiline
            />
            {addressError ? (
              <Text style={[styles.errorText, { color: colors.error }]}>{addressError}</Text>
            ) : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: colors.border }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: colors.text }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: primaryColor, borderColor: primaryColor }]}
                onPress={validateAndSave}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderRadius: 16,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  contactInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { fontSize: 20, fontWeight: '700' },
  contactDetails: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  contactAddress: { fontSize: 13 },
  contactActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 8 },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, marginTop: 16, textAlign: 'center' },
  addButton: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  addButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', padding: 24, borderRadius: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16 },
  errorText: { fontSize: 12, marginTop: -8, marginBottom: 12 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
});
