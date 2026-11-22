begin;

create table if not exists public.social_rooms (
 id uuid primary key default gen_random_uuid(),
 host uuid not null references public.profiles on delete cascade,
 code text not null unique check(code ~ '^[A-Z2-9]{4}$'),
 expires_at timestamptz not null
);
create table if not exists public.social_members (
 member uuid primary key references public.profiles on delete cascade,
 room uuid not null references public.social_rooms on delete cascade,
 joined_at timestamptz not null default now()
);
create index if not exists social_members_room_idx on public.social_members(room);
create table if not exists public.social_invites (
 sender uuid references public.profiles on delete cascade,
 recipient uuid references public.profiles on delete cascade,
 room uuid not null references public.social_rooms on delete cascade,
 sent_at timestamptz not null default now(),
 primary key(sender,recipient)
);
create index if not exists social_invites_recipient_idx on public.social_invites(recipient);
create table if not exists public.social_invite_limits (
 sender uuid references public.profiles on delete cascade,
 recipient uuid references public.profiles on delete cascade,
 sent_at timestamptz not null,
 primary key(sender,recipient)
);
alter table public.social_invite_limits enable row level security;
revoke all on public.social_invite_limits from public,anon,authenticated;
create table if not exists public.social_code_attempts (
 member uuid primary key references public.profiles on delete cascade,
 window_at timestamptz not null,
 attempts integer not null
);
alter table public.social_rooms enable row level security;
alter table public.social_members enable row level security;
alter table public.social_invites enable row level security;
alter table public.social_code_attempts enable row level security;
revoke all on public.social_rooms,public.social_members,public.social_invites,public.social_code_attempts from public,anon,authenticated;

drop policy if exists friendships_read_related on public.friendships;
create policy friendships_read_related on public.friendships for select to authenticated using (
 a=auth.uid() or (b=auth.uid() and status<>'blocked')
);

create or replace function public.social_presence_allowed(topic text) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select auth.uid() is not null and (
   topic='social:'||auth.uid()::text or exists (
     select from public.friendships f where f.status='accepted' and
     ((f.a=auth.uid() and topic='social:'||f.b::text) or (f.b=auth.uid() and topic='social:'||f.a::text))
   )
 );
$$;
drop policy if exists cendres_social_receive on realtime.messages;
create policy cendres_social_receive on realtime.messages for select to authenticated using (
 (extension='presence' and public.social_presence_allowed(realtime.topic())) or
 (extension='broadcast' and realtime.topic()='social:'||auth.uid()::text)
);
drop policy if exists cendres_social_track on realtime.messages;
create policy cendres_social_track on realtime.messages for insert to authenticated with check (
 extension='presence' and realtime.topic()='social:'||auth.uid()::text
);

create or replace function public.social_notify(user_id uuid) returns void
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select realtime.send('{}'::jsonb,'changed','social:'||user_id::text,true);
$$;

create or replace function public.social_state() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid:=auth.uid(); current_room public.social_rooms%rowtype;
begin
 if uid is null then raise insufficient_privilege; end if;
 select r.* into current_room from public.social_rooms r join public.social_members m on m.room=r.id
   where m.member=uid and r.expires_at>now();
 return jsonb_build_object(
  'friends',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'pseudo',p.pseudo,'status',f.status,'incoming',f.b=uid) order by p.pseudo)
    from public.friendships f join public.profiles p on p.id=case when f.a=uid then f.b else f.a end
    where (f.a=uid or f.b=uid) and (f.status<>'blocked' or f.a=uid)),'[]'::jsonb),
  'invites',coalesce((select jsonb_agg(jsonb_build_object('sender',p.id,'pseudo',p.pseudo,'sent',i.sent_at) order by i.sent_at desc)
    from public.social_invites i join public.profiles p on p.id=i.sender join public.social_rooms r on r.id=i.room
    join public.friendships f on least(f.a,f.b)=least(uid,i.sender) and greatest(f.a,f.b)=greatest(uid,i.sender) and f.status='accepted'
    where i.recipient=uid and r.expires_at>now() and i.sent_at>now()-interval '5 minutes'),'[]'::jsonb),
  'room',case when current_room.id is not null then jsonb_build_object(
    'code',current_room.code,'host',current_room.host,'expires',current_room.expires_at,'members',
    (select jsonb_agg(jsonb_build_object('id',p.id,'pseudo',p.pseudo) order by m.joined_at)
     from public.social_members m join public.profiles p on p.id=m.member where m.room=current_room.id)) end
 );
end;
$$;

create or replace function public.social_friend(p_action text,p_value text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid:=auth.uid(); target uuid; edge public.friendships%rowtype;
begin
 if uid is null then raise insufficient_privilege; end if;
 if p_action='request' then
   select id into target from public.profiles
   where lower(pseudo)=lower(trim(p_value)) or friend_code=upper(trim(p_value))
   order by (friend_code=upper(trim(p_value))) desc limit 1;
 elsif p_value ~ '^[0-9a-fA-F-]{36}$' then target:=p_value::uuid;
 end if;
 if target is null or target=uid then raise exception 'Profil introuvable' using errcode='P0001'; end if;
 perform pg_advisory_xact_lock(77124301);
 select * into edge from public.friendships where least(a,b)=least(uid,target) and greatest(a,b)=greatest(uid,target);
 if p_action='request' then
   if edge.status='blocked' then raise exception 'Profil indisponible' using errcode='P0001'; end if;
   if edge.status is not null then return public.social_state(); end if;
   if exists(select from public.friendships f cross join unnest(array[uid,target]) u(id)
     where f.status='pending' and (f.a=u.id or f.b=u.id) group by u.id having count(*)>=20) then
     raise exception 'Limite de 20 demandes en attente' using errcode='P0001';
   end if;
   insert into public.friendships(a,b) values(uid,target);
 elsif p_action='accept' and edge.status='pending' and edge.b=uid then
   if exists(select from public.friendships f cross join unnest(array[uid,target]) u(id)
     where f.status='accepted' and (f.a=u.id or f.b=u.id) group by u.id having count(*)>=100) then
     raise exception 'Limite de 100 amis' using errcode='P0001';
   end if;
   update public.friendships set status='accepted' where a=edge.a and b=edge.b;
 elsif (p_action='decline' and edge.status='pending' and edge.b=uid)
    or (p_action='remove' and edge.status in ('pending','accepted'))
    or (p_action='unblock' and edge.status='blocked' and edge.a=uid) then
   delete from public.friendships where a=edge.a and b=edge.b;
 elsif p_action='block' and edge.status in ('pending','accepted') then
   delete from public.friendships where a=edge.a and b=edge.b;
   insert into public.friendships(a,b,status) values(uid,target,'blocked');
 else raise exception 'Action indisponible' using errcode='P0001';
 end if;
 if p_action in ('block','remove') then
   delete from public.social_invites where (sender=uid and recipient=target) or (sender=target and recipient=uid);
 end if;
 perform public.social_notify(uid);
 perform public.social_notify(target);
 return public.social_state();
end;
$$;

create or replace function public.social_room(p_action text,p_value text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
 uid uuid:=auth.uid(); target uuid; old_room public.social_rooms%rowtype; next_room public.social_rooms%rowtype;
 alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; candidate text; n integer; person uuid; tries integer;
begin
 if uid is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(77124301);
 delete from public.social_rooms where expires_at<=now();
 select r.* into old_room from public.social_rooms r join public.social_members m on m.room=r.id where m.member=uid;
 if p_action='invite' then
   target:=p_value::uuid;
   if not exists(select from public.friendships where status='accepted' and least(a,b)=least(uid,target) and greatest(a,b)=greatest(uid,target)) then
     raise exception 'Ami indisponible' using errcode='P0001';
   end if;
   if exists(select from public.social_invite_limits where sender=uid and recipient=target and sent_at>now()-interval '5 seconds') then
     raise exception 'Attends 5 secondes avant de réinviter cet ami' using errcode='P0001';
   end if;
 end if;

 if p_action in ('create','invite') and old_room.id is null then
   for attempt in 1..16 loop
     candidate:='';
     for j in 1..4 loop candidate:=candidate||substr(alphabet,1+floor(random()*length(alphabet))::integer,1); end loop;
     insert into public.social_rooms(host,code,expires_at) values(uid,candidate,now()+interval '1 hour')
       on conflict(code) do nothing returning * into old_room;
     exit when old_room.id is not null;
   end loop;
   if old_room.id is null then raise exception 'Création indisponible' using errcode='P0001'; end if;
   insert into public.social_members(member,room) values(uid,old_room.id);
 elsif p_action='join' then
   insert into public.social_code_attempts(member,window_at,attempts) values(uid,now(),1)
   on conflict(member) do update set
    attempts=case when public.social_code_attempts.window_at<now()-interval '1 minute' then 1 else least(21,public.social_code_attempts.attempts+1) end,
    window_at=case when public.social_code_attempts.window_at<now()-interval '1 minute' then now() else public.social_code_attempts.window_at end
   returning attempts into tries;
   if tries>20 then return jsonb_build_object('error','Réessaie dans une minute'); end if;
   select * into next_room from public.social_rooms where code=upper(trim(p_value));
 elsif p_action='accept' then
   target:=p_value::uuid;
   select r.* into next_room from public.social_invites i join public.social_rooms r on r.id=i.room
    where i.recipient=uid and i.sender=target and i.sent_at>now()-interval '5 minutes'
    and exists(select from public.friendships f where f.status='accepted' and least(f.a,f.b)=least(uid,target) and greatest(f.a,f.b)=greatest(uid,target));
 elsif p_action='dismiss' then
   delete from public.social_invites where recipient=uid and sender=p_value::uuid;
 elsif p_action not in ('create','invite','leave') then
   raise exception 'Action indisponible' using errcode='P0001';
 end if;

 if p_action in ('accept','join') then
   if next_room.id is null or exists(select from public.social_members m join public.friendships f
     on least(f.a,f.b)=least(uid,m.member) and greatest(f.a,f.b)=greatest(uid,m.member)
     where m.room=next_room.id and f.status='blocked') then
     return jsonb_build_object('error','Salon introuvable ou invitation expirée');
   end if;
   select count(*) into n from public.social_members where room=next_room.id;
   if n>=4 and old_room.id is distinct from next_room.id then return jsonb_build_object('error','Le salon est complet'); end if;
 end if;
 if (p_action='leave' or (next_room.id is not null and next_room.id is distinct from old_room.id)) and old_room.id is not null then
   delete from public.social_members where member=uid;
   for person in select member from public.social_members where room=old_room.id loop perform public.social_notify(person); end loop;
   if old_room.host=uid then delete from public.social_rooms where id=old_room.id; end if;
 end if;
 if next_room.id is not null then
   insert into public.social_members(member,room) values(uid,next_room.id) on conflict(member) do nothing;
   delete from public.social_invites where recipient=uid and room=next_room.id;
   for person in select member from public.social_members where room=next_room.id loop perform public.social_notify(person); end loop;
 end if;
 if p_action='invite' then
   insert into public.social_invite_limits(sender,recipient,sent_at) values(uid,target,now())
     on conflict(sender,recipient) do update set sent_at=excluded.sent_at;
   insert into public.social_invites(sender,recipient,room) values(uid,target,old_room.id)
     on conflict(sender,recipient) do update set room=excluded.room,sent_at=now();
   perform public.social_notify(target);
 end if;
 return public.social_state();
end;
$$;

revoke execute on function public.social_notify(uuid),public.social_presence_allowed(text),public.social_state(),
 public.social_friend(text,text),public.social_room(text,text) from public,anon,authenticated;
grant execute on function public.social_presence_allowed(text),public.social_state(),public.social_friend(text,text),
 public.social_room(text,text) to authenticated;
commit;
