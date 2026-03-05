'use client';
import { formatTag, type Friend, type FriendRequest } from '../../lib/supabaseClient';

interface FriendsListProps {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onRemove: (friendId: string) => void;
}

export default function FriendsList({
  friends, incoming, outgoing, onAccept, onDecline, onRemove
}: FriendsListProps) {
  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <section>
          <p className="text-xs text-white/50 uppercase tracking-widest font-semibold mb-2">
            Incoming ({incoming.length})
          </p>
          {incoming.map(req => (
            <div key={req.id} className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-white">
                {req.sender?.display_name}
                <span className="text-white/40 text-xs ml-1">
                  #{req.sender?.discriminator}
                </span>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => onAccept(req.id)}
                  className="text-xs px-3 py-1 bg-green-600 hover:bg-green-500 rounded transition"
                >
                  Accept
                </button>
                <button
                  onClick={() => onDecline(req.id)}
                  className="text-xs px-3 py-1 bg-red-700 hover:bg-red-600 rounded transition"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Outgoing requests */}
      {outgoing.length > 0 && (
        <section>
          <p className="text-xs text-white/50 uppercase tracking-widest font-semibold mb-2">
            Pending ({outgoing.length})
          </p>
          {outgoing.map(req => (
            <div key={req.id} className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-white/60">
                {req.receiver?.display_name}
                <span className="text-white/30 text-xs ml-1">
                  #{req.receiver?.discriminator}
                </span>
              </span>
              <span className="text-xs text-yellow-400">Pending</span>
            </div>
          ))}
        </section>
      )}

      {/* Friends */}
      <section>
        <p className="text-xs text-white/50 uppercase tracking-widest font-semibold mb-2">
          Friends — {friends.length}
        </p>
        {friends.length === 0 && (
          <p className="text-xs text-white/30">No friends yet. Add someone above!</p>
        )}
        {friends.map(f => (
          <div key={f.id} className="flex items-center justify-between py-2 border-b border-white/5 group">
            <span className="text-sm text-white">
              {f.profile?.display_name}
              <span className="text-white/40 text-xs ml-1">
                {f.profile ? `#${f.profile.discriminator}` : ''}
              </span>
            </span>
            <button
              onClick={() => onRemove(f.friend_id)}
              className="text-xs text-red-400 opacity-0 group-hover:opacity-100 transition"
            >
              Remove
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}