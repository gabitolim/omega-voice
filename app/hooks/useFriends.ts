import { useEffect, useState, useCallback } from 'react';
import { supabase, parseTag, type Friend, type FriendRequest } from '../lib/supabaseClient';

export function useFriends(userId: string | null) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    const [friendsRes, incomingRes, outgoingRes] = await Promise.all([
      supabase
        .from('friends')
        .select('*, profile:profiles!friends_friend_id_fkey(id, display_name, tag, discriminator)')
        .eq('user_id', userId),

      supabase
        .from('friend_requests')
        .select('*, sender:profiles!friend_requests_sender_id_fkey(id, display_name, tag, discriminator)')
        .eq('receiver_id', userId)
        .eq('status', 'pending'),

      supabase
        .from('friend_requests')
        .select('*, receiver:profiles!friend_requests_receiver_id_fkey(id, display_name, tag, discriminator)')
        .eq('sender_id', userId)
        .eq('status', 'pending'),
    ]);

    if (friendsRes.error) setError(friendsRes.error.message);
    else setFriends(friendsRes.data as Friend[]);

    if (incomingRes.error) setError(incomingRes.error.message);
    else setIncoming(incomingRes.data as FriendRequest[]);

    if (outgoingRes.error) setError(outgoingRes.error.message);
    else setOutgoing(outgoingRes.data as FriendRequest[]);

    setLoading(false);
  }, [userId]);

  // ── Send friend request ──────────────────────────────────────────────────

  const sendRequest = useCallback(async (fullTag: string): Promise<string | null> => {
    if (!userId) return 'Not logged in';

    const parsed = parseTag(fullTag);
    if (!parsed) return 'Invalid format. Use username#0000';

    // Find the target profile
    const { data: target, error: findError } = await supabase
      .from('profiles')
      .select('id, display_name, tag, discriminator')
      .eq('tag', parsed.tag)
      .eq('discriminator', parsed.discriminator)
      .single();

    if (findError || !target) return 'User not found';
    if (target.id === userId) return "You can't add yourself";

    // Check not already friends
    const { data: existing } = await supabase
      .from('friends')
      .select('id')
      .eq('user_id', userId)
      .eq('friend_id', target.id)
      .maybeSingle();

    if (existing) return 'Already friends';

    const { error: reqError } = await supabase
      .from('friend_requests')
      .insert({ sender_id: userId, receiver_id: target.id });

    if (reqError) {
      if (reqError.code === '23505') return 'Friend request already sent';
      return reqError.message;
    }

    await fetchAll();
    return null; // null = success
  }, [userId, fetchAll]);

  // ── Accept / Decline ─────────────────────────────────────────────────────

  const respondToRequest = useCallback(async (
    requestId: string,
    action: 'accepted' | 'declined'
  ) => {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: action, updated_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) { setError(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  // ── Remove friend ────────────────────────────────────────────────────────

  const removeFriend = useCallback(async (friendId: string) => {
    await Promise.all([
      supabase.from('friends').delete()
        .eq('user_id', userId).eq('friend_id', friendId),
      supabase.from('friends').delete()
        .eq('user_id', friendId).eq('friend_id', userId),
    ]);
    await fetchAll();
  }, [userId, fetchAll]);

  // ── Realtime ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;
    fetchAll();

    const channel = supabase
      .channel(`friends:${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'friend_requests',
        filter: `receiver_id=eq.${userId}`,
      }, fetchAll)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'friends',
        filter: `user_id=eq.${userId}`,
      }, fetchAll)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchAll]);

  return {
    friends,
    incoming,
    outgoing,
    loading,
    error,
    sendRequest,
    respondToRequest,
    removeFriend,
    refetch: fetchAll,
  };
}