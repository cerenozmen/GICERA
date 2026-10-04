import { Ionicons } from '@react-native-vector-icons/ionicons';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell } from '../components/Bell';
import { Avatar, Chip, EmptyState, PrimaryButton, Tag } from '../components/common';
import { CATEGORIES, timeAgo } from '../discussion';
import { forumApi } from '../forumApi';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, serif } from '../theme';
import { ForumPost } from '../types';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Discussion'>, NativeStackScreenProps<RootStackParamList>>;

const ALL = 'Tümü';
const SAVED = 'Kaydedilenler';

export function DiscussionScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>(ALL);
  const [posts, setPosts] = useState<ForumPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(0);

  // Typing settles for a moment before it searches.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const call = ++latest.current;
    try {
      const result = await forumApi.listPosts({
        category: filter === ALL || filter === SAVED ? undefined : filter,
        saved: filter === SAVED,
        q: search,
      });
      if (call !== latest.current) return; // an older filter's answer arriving late
      setPosts(result);
      setError(null);
    } catch (err) {
      if (call === latest.current) setError(err instanceof Error ? err.message : 'Konular yüklenemedi.');
    }
  }, [filter, search]);

  // On opening the tab, and on coming back from a topic or a new post.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleLike(post: ForumPost) {
    const on = !post.liked;
    const patch = (liked: boolean, likeCount: number) => setPosts(current => current?.map(p => (p.id === post.id ? { ...p, liked, likeCount } : p)) ?? null);
    patch(on, post.likeCount + (on ? 1 : -1));
    try {
      const { count } = await forumApi.setPostLike(post.id, on);
      patch(on, count);
    } catch {
      patch(post.liked, post.likeCount);
    }
  }

  async function toggleSaved(post: ForumPost) {
    const patch = (saved: boolean) => setPosts(current => current?.map(p => (p.id === post.id ? { ...p, saved } : p)) ?? null);
    patch(!post.saved);
    try {
      await forumApi.setPostSaved(post.id, !post.saved);
      if (filter === SAVED) load();
    } catch {
      patch(post.saved);
    }
  }

  function openMenu(post: ForumPost) {
    Alert.alert(post.title, undefined, [
      { text: post.saved ? 'Kaydedilenlerden çıkar' : 'Kaydet', onPress: () => toggleSaved(post) },
      ...(post.mine
        ? [
            {
              text: 'Sil',
              style: 'destructive' as const,
              onPress: () =>
                Alert.alert('Konu silinsin mi?', 'Konu ve tüm yanıtları kalıcı olarak silinir.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: () =>
                      forumApi
                        .deletePost(post.id)
                        .then(load)
                        .catch(err => Alert.alert('Silinemedi', err instanceof Error ? err.message : 'Tekrar dene.')),
                  },
                ]),
            },
          ]
        : []),
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={styles.pad}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Tartışma</Text>
            <Bell onPress={() => navigation.navigate('Notifications')} />
          </View>
          <Text style={styles.sub}>Cilt bakımıyla ilgili sor, paylaş, keşfet.{'\n'}Topluluğumuzla deneyimlerini konuş.</Text>

          <View style={styles.search}>
            <Ionicons name="search-outline" size={20} color={colors.muted} />
            <TextInput style={styles.searchInput} placeholder="Konu ara..." placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[ALL, ...CATEGORIES, SAVED].map(c => (
            <Chip key={c} label={c} active={filter === c} onPress={() => setFilter(c)} />
          ))}
        </ScrollView>

        <View style={[styles.pad, styles.list]}>
          {error && !posts?.length ? (
            <EmptyState icon="cloud-offline-outline" title="Konular yüklenemedi" text={error}>
              <PrimaryButton label="Tekrar dene" icon="refresh-outline" onPress={load} style={styles.retry} />
            </EmptyState>
          ) : posts === null ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : posts.length === 0 ? (
            <EmptyState
              icon="chatbubbles-outline"
              title={filter === SAVED ? 'Kaydettiğin konu yok' : 'Henüz konu yok'}
              text={filter === SAVED ? 'Bir konunun sayfasında yer imine dokunarak kaydedebilirsin.' : 'İlk soruyu sen sor, topluluk yanıtlasın.'}
            >
              {filter !== SAVED && (
                <PrimaryButton label="Yeni konu aç" icon="create-outline" onPress={() => navigation.navigate('NewPost')} style={styles.retry} />
              )}
            </EmptyState>
          ) : (
            posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
                onLike={() => toggleLike(post)}
                onMenu={() => openMenu(post)}
              />
            ))
          )}
        </View>
      </ScrollView>
      <Pressable style={styles.fab} onPress={() => navigation.navigate('NewPost')} accessibilityLabel="Yeni konu aç">
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

function PostCard({ post, onPress, onLike, onMenu }: { post: ForumPost; onPress: () => void; onLike: () => void; onMenu: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Avatar name={post.authorName} />
      <View style={styles.cardBody}>
        <View style={styles.meta}>
          <Text style={styles.author}>{post.authorName}</Text>
          <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
          <View style={styles.spacer} />
          <Pressable onPress={onMenu} hitSlop={12} accessibilityLabel="Seçenekler">
            <Ionicons name="ellipsis-vertical" size={18} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.postTitle}>{post.title}</Text>
        <Text style={styles.body} numberOfLines={3}>
          {post.body}
        </Text>
        <View style={styles.footer}>
          <View style={styles.stat}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.text} />
            <Text style={styles.statText}>{post.replyCount}</Text>
          </View>
          <Pressable style={styles.stat} onPress={onLike} hitSlop={8}>
            <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={19} color={post.liked ? colors.danger : colors.text} />
            <Text style={styles.statText}>{post.likeCount}</Text>
          </Pressable>
          <View style={styles.spacer} />
          <Tag label={post.category} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20 },
  list: { gap: 12 },
  loading: { marginTop: 40 },
  retry: { marginTop: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: serif, fontSize: 36, color: colors.text },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  sub: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.text, fontSize: 15 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14 },
  cardBody: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { fontSize: 14, fontWeight: '500', color: colors.text },
  time: { fontSize: 12, color: colors.muted },
  postTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6 },
  spacer: { flex: 1 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 13, color: colors.text },
});
