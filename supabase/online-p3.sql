begin;

alter table public.social_rooms add column if not exists difficulty text not null default 'normal' check(difficulty in ('calme','normal','ardue'));
alter table public.social_rooms add column if not exists map text not null default 'marais' check(map in ('marais','tourbiere','lisiere'));
alter table public.social_rooms add column if not exists match_id uuid;
alter table public.social_rooms add column if not exists starts_at timestamptz;
alter table public.social_members add column if not exists ready boolean not null default false;
alter table public.social_members add column if not exists character integer not null default 0 check(character between 0 and 4);
alter table public.social_members add column if not exists weapon integer not null default 0 check(weapon between 0 and 11);

create table if not exists public.coop_starts (
 match_id uuid primary key,
 room_id uuid not null,
 host_id uuid not null references public.profiles on delete cascade,
 players jsonb not null check(jsonb_typeof(players)='array' and jsonb_array_length(players) between 2 and 4),
 started_at timestamptz not null,
 difficulty text not null,
 map text not null
);
alter table public.coop_starts enable row level security;
revoke all on public.coop_starts from public,anon,authenticated;

create or replace function public.coop_topic_allowed(p_topic text,p_write boolean) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select auth.uid() is not null and exists (
   select from public.social_members m
     join public.social_rooms r on r.id=m.room
     join public.social_members sender on sender.room=r.id
     join public.social_members receiver on receiver.room=r.id
   where m.member=auth.uid() and r.expires_at>now()
     and p_topic='coop:'||r.id::text||':'||sender.member::text||':'||receiver.member::text
     and auth.uid() in (sender.member,receiver.member)
     and (not p_write or sender.member=auth.uid())
 );
$$;
drop policy if exists cendres_coop_receive on realtime.messages;
create policy cendres_coop_receive on realtime.messages for select to authenticated using (
 extension='broadcast' and public.coop_topic_allowed(realtime.topic(),false)
);
drop policy if exists cendres_coop_send on realtime.messages;
create policy cendres_coop_send on realtime.messages for insert to authenticated with check (
 extension='broadcast' and public.coop_topic_allowed(realtime.topic(),true)
);

create or replace function public.coop_state() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid:=auth.uid(); r public.social_rooms%rowtype; roster jsonb;
begin
 if uid is null then raise insufficient_privilege; end if;
 select sr.* into r from public.social_rooms sr join public.social_members m on m.room=sr.id
   where m.member=uid and sr.expires_at>now();
 if r.id is null then return 'null'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.member,'pseudo',p.pseudo,'character',m.character,'weapon',m.weapon,
      'ready',m.ready,'equipped',coalesce(p.equipped,'{}'::jsonb)) order by m.joined_at,p.id),'[]'::jsonb)
 into roster from public.social_members m join public.profiles p on p.id=m.member where m.room=r.id;
 if r.match_id is not null then
   select players into roster from public.coop_starts where match_id=r.match_id;
 end if;
 return jsonb_build_object('roomId',r.id,'id',r.match_id,'host',r.host,'local',uid,'difficulty',r.difficulty,
   'map',r.map,'startedAt',floor(extract(epoch from r.starts_at)*1000)::bigint,
   'serverNow',floor(extract(epoch from clock_timestamp())*1000)::bigint,'players',roster);
end;
$$;

create or replace function public.coop_lobby(p_action text,p_value jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid:=auth.uid(); r public.social_rooms%rowtype; member_id uuid; snapshot jsonb; candidate uuid;
 hero integer; arm integer; owned_heroes integer; owned_arms integer;
begin
 if uid is null then raise insufficient_privilege; end if;
 if p_action='state' then return public.coop_state(); end if;
 perform pg_advisory_xact_lock(77124301);
 select sr.* into r from public.social_rooms sr join public.social_members m on m.room=sr.id
   where m.member=uid and sr.expires_at>now();
 if r.id is null then return jsonb_build_object('error','Aucun salon'); end if;

 if p_action='finish' and uid=r.host and r.match_id is not null then
   if r.starts_at>now() or p_value->>'id' is distinct from r.match_id::text then
     return jsonb_build_object('error','Partie indisponible');
   end if;
   update public.social_rooms set match_id=null,starts_at=null where id=r.id;
   update public.social_members set ready=false where room=r.id;
 elsif p_action='cancel' and uid=r.host and r.match_id is not null and r.starts_at>clock_timestamp() then
   delete from public.coop_starts where match_id=r.match_id;
   update public.social_rooms set match_id=null,starts_at=null where id=r.id;
   update public.social_members set ready=false where room=r.id;
 elsif r.match_id is not null then
   return jsonb_build_object('error','La partie est déjà lancée');
 elsif p_action='setup' and uid=r.host then
   if (p_value->>'difficulty') not in ('calme','normal','ardue') or (p_value->>'map') not in ('marais','tourbiere','lisiere')
      or p_value->>'difficulty' is null or p_value->>'map' is null then
      return jsonb_build_object('error','Réglages invalides');
   end if;
   update public.social_rooms set difficulty=p_value->>'difficulty',map=p_value->>'map' where id=r.id;
   update public.social_members set ready=false where room=r.id;
 elsif p_action='loadout' then
   if coalesce(p_value->>'character','') !~ '^[0-4]$' or coalesce(p_value->>'weapon','') !~ '^([0-9]|10|11)$' then
     return jsonb_build_object('error','Équipement invalide');
   end if;
   hero:=(p_value->>'character')::integer; arm:=(p_value->>'weapon')::integer;
   select coalesce((state->>'characters')::integer,1),coalesce((state->>'weapons')::integer,15) into owned_heroes,owned_arms
     from public.solo_saves where user_id=uid;
   if ((coalesce(owned_heroes,1) >> hero) & 1)=0 or ((coalesce(owned_arms,15) >> arm) & 1)=0 then
      return jsonb_build_object('error','Équipement verrouillé');
   end if;
   update public.social_members set character=hero,weapon=arm,ready=false where member=uid and room=r.id;
 elsif p_action='ready' then
   if jsonb_typeof(p_value->'ready') is distinct from 'boolean' then return jsonb_build_object('error','État invalide'); end if;
   update public.social_members set ready=(p_value->>'ready')::boolean where member=uid and room=r.id;
 elsif p_action='launch' and uid=r.host then
   snapshot:=public.coop_state();
   if jsonb_array_length(snapshot->'players')<2 or exists(select from public.social_members where room=r.id and not ready) then
      return jsonb_build_object('error','Attends que tous les joueurs soient prêts');
   end if;
   candidate:=gen_random_uuid();
   insert into public.coop_starts(match_id,room_id,host_id,players,started_at,difficulty,map)
    values(candidate,r.id,uid,snapshot->'players',clock_timestamp()+interval '4 seconds',r.difficulty,r.map)
    returning started_at into r.starts_at;
   update public.social_rooms set match_id=candidate,starts_at=r.starts_at where id=r.id;
 else
   return jsonb_build_object('error','Action indisponible');
 end if;
 for member_id in select member from public.social_members where room=r.id loop
   perform public.social_notify(member_id);
   perform realtime.send('{}'::jsonb,'lobby','coop:'||r.id::text||':'||member_id::text||':'||member_id::text,true);
 end loop;
 return public.coop_state();
end;
$$;

create or replace function public.coop_membership_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if exists(select from public.social_rooms r where r.id=new.room and r.match_id is not null)
    and not exists(select from public.social_members where member=new.member and room=new.room) then
   raise exception 'La partie est déjà lancée' using errcode='P0001';
 end if;
 return new;
end;
$$;
drop trigger if exists cendres_coop_membership_guard on public.social_members;
create trigger cendres_coop_membership_guard before insert on public.social_members
 for each row execute function public.coop_membership_guard();

create or replace function public.coop_membership_departed() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $
declare canceled uuid;
begin
 select match_id into canceled from public.social_rooms where id=old.room and starts_at>clock_timestamp();
 if canceled is not null then
   delete from public.coop_starts where match_id=canceled;
   update public.social_rooms set match_id=null,starts_at=null where id=old.room;
   update public.social_members set ready=false where room=old.room;
 end if;
 return old;
end;
$$;
drop trigger if exists cendres_coop_membership_departed on public.social_members;
create trigger cendres_coop_membership_departed after delete on public.social_members
 for each row execute function public.coop_membership_departed();

revoke execute on function public.coop_state(),public.coop_lobby(text,jsonb),public.coop_topic_allowed(text,boolean),
 public.coop_membership_guard(),public.coop_membership_departed() from public,anon,authenticated;
grant execute on function public.coop_lobby(text,jsonb),public.coop_topic_allowed(text,boolean) to authenticated;

commit;
