import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Image, Linking, Platform
} from 'react-native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// 🔗 الروابط الخاصة بالمشروع (تم تحديث الرابط الرئيسي)
const LINKS = {
  twitter: 'https://x.com/MoniCoinMECO',
  telegram: 'https://t.me/MECO_Community',
  github: 'https://monycoin.github.io/meco-token/',
  website: 'https://monycoin1.blogspot.com/',
  // ✅ رابط Jupiter المباشر لعملة MECO
  jupiterMeco: 'https://jup.ag/tokens/7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i',
  presaleScan: 'https://solscan.io/account/E9repjjKBq3RVLw1qckrG15gKth63fe98AHCSgXZzKvY'
};

export default function MecoWorldScreen() {
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const colors = {
    background: isDark ? '#0A0A0F' : '#F2F3F7',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#8E8E93',
    banner: primaryColor,
  };

  const openLink = (url) => {
    Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  const SocialCard = ({ title, icon, color, url, description }) => (
    <TouchableOpacity
      style={[styles.socialCard, { backgroundColor: colors.card }]}
      onPress={() => openLink(url)}
      activeOpacity={0.8}
    >
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      
      {/* 1. البطاقة الإعلانية (Banner) - محدثة */}
      <View style={[styles.banner, { backgroundColor: colors.banner }]}>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>{t('mecoWorld.banner_title')}</Text>
          <Text style={styles.bannerSubtitle}>{t('mecoWorld.banner_desc')}</Text>
          
          {/* ✅ الزر الجديد: يفتح Jupiter */}
          <TouchableOpacity 
            style={styles.bannerButton}
            onPress={() => openLink(LINKS.jupiterMeco)}
          >
            <Text style={[styles.bannerBtnText, { color: primaryColor }]}>
              {t('mecoWorld.buy_on_jupiter') || "شراء ومبادلة MECO"} 
            </Text>
            <Ionicons name="open-outline" size={16} color={primaryColor} style={{marginLeft: 5}} />
          </TouchableOpacity>
        </View>
        <Ionicons name="rocket-outline" size={80} color="rgba(255,255,255,0.2)" style={styles.bannerIcon} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('mecoWorld.community')}</Text>

      {/* 2. روابط المجتمع */}
      <View style={styles.grid}>
        <SocialCard 
          title="X (Twitter)" 
          description={t('mecoWorld.desc_twitter')}
          icon="logo-twitter" 
          color="#1DA1F2" 
          url={LINKS.twitter} 
        />
        <SocialCard 
          title="Telegram" 
          description={t('mecoWorld.desc_telegram')}
          icon="paper-plane" 
          color="#229ED9" 
          url={LINKS.telegram} 
        />
        <SocialCard 
          title="GitHub" 
          description={t('mecoWorld.desc_github')}
          icon="logo-github" 
          color={isDark ? "#FFF" : "#333"} 
          url={LINKS.github} 
        />
        <SocialCard 
          title="Website" 
          description={t('mecoWorld.desc_website')}
          icon="globe" 
          color="#FF9900" 
          url={LINKS.website} 
        />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('mecoWorld.transparency')}</Text>

      {/* 3. الشفافية (Solscan) */}
      <TouchableOpacity 
        style={[styles.transparencyCard, { backgroundColor: colors.card, borderColor: primaryColor }]}
        onPress={() => openLink(LINKS.presaleScan)}
      >
        <View style={styles.transparencyHeader}>
          <Ionicons name="scan-circle-outline" size={32} color={primaryColor} />
          <View style={{marginLeft: 12, flex: 1}}>
            <Text style={[styles.transparencyTitle, { color: colors.text }]}>{t('mecoWorld.solscan_title')}</Text>
            <Text style={[styles.transparencyDesc, { color: colors.textSecondary }]}>
              {t('mecoWorld.solscan_desc')}
            </Text>
          </View>
        </View>
        <View style={[styles.linkBadge, { backgroundColor: primaryColor + '15' }]}>
          <Text style={[styles.linkText, { color: primaryColor }]}>View on Solscan ↗</Text>
        </View>
      </TouchableOpacity>

      <View style={{ height: 100 }} /> 
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 50 }, 
  
  // Banner
  banner: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 30,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  bannerContent: { zIndex: 2 },
  bannerTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFF', marginBottom: 8 },
  bannerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 16, lineHeight: 20 },
  bannerButton: { 
    backgroundColor: '#FFF', 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    borderRadius: 25, 
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center'
  },
  bannerBtnText: { fontWeight: 'bold', fontSize: 14 },
  bannerIcon: { position: 'absolute', right: -20, bottom: -20, zIndex: 1 },

  // Sections
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, marginLeft: 4 },
  grid: { gap: 16, marginBottom: 30 },

  // Cards
  socialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  cardDesc: { fontSize: 12 },

  // Transparency
  transparencyCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  transparencyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  transparencyTitle: { fontSize: 16, fontWeight: 'bold' },
  transparencyDesc: { fontSize: 12, marginTop: 2 },
  linkBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  linkText: { fontSize: 12, fontWeight: '600' }
});
