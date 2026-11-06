import { useMemo } from 'react';

import type { Group } from '@/api';
import { useGroups } from '@/queries';
import { useSession } from '@/stores/session';

export interface Person {
  id: string;
  name: string;
  firstName: string;
  avatarUrl: string | null;
  email: string | null;
}

export const firstNameOf = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'Someone';

/** Everyone the user can see (all members of all their groups), keyed by profile id. */
export function usePeople() {
  const me = useSession((s) => s.me);
  const { data: groups } = useGroups();
  return useMemo(() => {
    const map = new Map<string, Person>();
    for (const g of groups ?? []) {
      for (const m of g.members) {
        if (!map.has(m.profileId))
          map.set(m.profileId, {
            id: m.profileId,
            name: m.name,
            firstName: firstNameOf(m.name),
            avatarUrl: m.avatarUrl,
            email: m.email,
          });
      }
    }
    if (me) {
      const p = me.profile;
      map.set(p.id, {
        id: p.id,
        name: p.fullName,
        firstName: firstNameOf(p.fullName),
        avatarUrl: p.avatarUrl,
        email: p.email,
      });
    }
    const myId = me?.profile.id ?? '';
    const get = (id: string | null | undefined): Person =>
      (id && map.get(id)) || {
        id: id ?? '',
        name: 'Former member',
        firstName: 'Someone',
        avatarUrl: null,
        email: null,
      };
    /** "You" for me, first name for others. */
    const label = (id: string | null | undefined) => (id === myId ? 'You' : get(id).firstName);
    return { map, get, label, myId };
  }, [groups, me]);
}

export function activeMembers(g: Group) {
  return g.members.filter((m) => m.status === 'active');
}
