-- Partner storefronts. Private tables, accessed only through the verified server API.
create table public.market_merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id bigint not null check (owner_id > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2200000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','paused')),
  paid_until timestamptz,
  review_note text not null default '',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index market_merchants_owner on public.market_merchants(owner_id);
create index market_merchants_catalog on public.market_merchants(status, paid_until);
create table public.market_payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.market_merchants(id),
  recorded_by bigint not null,
  receipt text not null check (length(receipt) between 3 and 120),
  amount_rub integer not null default 3000 check (amount_rub = 3000),
  previous_until timestamptz,
  paid_until timestamptz not null,
  created_at timestamptz not null default now(),
  unique (merchant_id, receipt)
);
create table public.market_mutations (
  actor_id bigint not null,
  mutation_id uuid not null,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id, mutation_id)
);
create index market_mutations_rate on public.market_mutations(actor_id, created_at);
alter table public.market_merchants enable row level security;
alter table public.market_payments enable row level security;
alter table public.market_mutations enable row level security;
revoke all on public.market_merchants, public.market_payments, public.market_mutations from public, anon, authenticated;
grant all on public.market_merchants, public.market_payments, public.market_mutations to service_role;

create function public.lubimka_market(p_actor bigint, p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  m public.market_merchants%rowtype;
  cached public.market_mutations%rowtype;
  result jsonb;
  mutation uuid;
  fingerprint text;
  expected integer;
  prior timestamptz;
  v_receipt text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'MARKET_INVALID'; end if;
  if p_action = 'catalog' then
    select coalesce(jsonb_agg(entry order by created_at desc, id), '[]') into result from (
      select id, created_at, jsonb_build_object('id',id,'name',data->>'name','kind',data->>'kind',
        'city',data->>'city','description',left(data->>'description',160), 'photo',data->'photo',
        'itemCount',jsonb_array_length(data->'items')) entry
      from public.market_merchants
      where status='approved' and paid_until > now()
        and (coalesce(p_data->>'kind','')='' or data->>'kind'=p_data->>'kind')
        and (coalesce(p_data->>'city','')='' or position(lower(p_data->>'city') in lower(data->>'city'))>0)
        and (coalesce(p_data->>'query','')='' or position(lower(p_data->>'query') in lower(concat_ws(' ',data->>'name',data->>'description',data->>'city')))>0
          or exists(select 1 from jsonb_array_elements(data->'items') item where position(lower(p_data->>'query') in lower(concat_ws(' ',item->>'name',item->>'description')))>0))
      order by created_at desc,id limit 100
    ) list;
    return jsonb_build_object('merchants',result);
  end if;
  if p_action = 'detail' then
    select * into m from public.market_merchants where id=(p_data->>'id')::uuid and status='approved' and paid_until>now();
    if not found then raise exception 'MARKET_NOT_FOUND'; end if;
    return jsonb_build_object('merchant',jsonb_build_object('id',m.id,'data',m.data));
  end if;
  if p_actor is null or p_actor<=0 then raise exception 'MARKET_UNAUTHORIZED'; end if;
  if p_action='mine' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') into result from public.market_merchants t where t.owner_id=p_actor;
    return jsonb_build_object('merchants',result,'admin',p_actor=1699772237);
  end if;
  if p_action like 'admin.%' and p_actor<>1699772237 then raise exception 'MARKET_FORBIDDEN'; end if;
  if p_action='admin.list' then
    select coalesce(jsonb_agg((to_jsonb(t)-'data')||jsonb_build_object('data',jsonb_build_object('name',t.data->>'name','kind',t.data->>'kind','city',t.data->>'city')) order by t.updated_at desc),'[]') into result from (
      select * from public.market_merchants where coalesce(p_data->>'status','')='' or status=p_data->>'status' order by updated_at desc limit 100
    ) t;
    return jsonb_build_object('merchants',result);
  end if;
  if p_action='admin.detail' then
    select * into m from public.market_merchants where id=(p_data->>'id')::uuid;
    if not found then raise exception 'MARKET_NOT_FOUND'; end if;
    return jsonb_build_object('merchant',to_jsonb(m));
  end if;
  if p_action not in ('save','pause','admin.review','admin.payment') then raise exception 'MARKET_INVALID'; end if;
  mutation := (p_data->>'mutationId')::uuid;
  if mutation is null then raise exception 'MARKET_INVALID'; end if;
  fingerprint := md5(p_action || p_data::text);
  perform pg_advisory_xact_lock(hashtextextended('lubimka-market:' || p_actor::text,0));
  select * into cached from public.market_mutations where actor_id=p_actor and mutation_id=mutation;
  if found then
    if cached.fingerprint<>fingerprint then raise exception 'MARKET_REUSE'; end if;
    return cached.result;
  end if;
  if (select count(*) from public.market_mutations where actor_id=p_actor and created_at>now()-interval '1 minute')>=12 then raise exception 'MARKET_RATE'; end if;
  if coalesce(p_data->>'id','')<>'' then
    select * into m from public.market_merchants where id=(p_data->>'id')::uuid for update;
    if not found then raise exception 'MARKET_NOT_FOUND'; end if;
    if p_action not like 'admin.%' and m.owner_id<>p_actor then raise exception 'MARKET_NOT_FOUND'; end if;
    expected := (p_data->>'baseVersion')::integer;
    if expected is null or expected<>m.version then raise exception 'MARKET_CONFLICT'; end if;
  elsif p_action<>'save' then raise exception 'MARKET_INVALID';
  end if;
  if p_action='save' then
    if jsonb_typeof(p_data->'data') is distinct from 'object'
      or coalesce(p_data->'data'->>'kind','') not in ('store','grooming','vet')
      or length(coalesce(p_data->'data'->>'name','')) not between 2 and 100
      or length(coalesce(p_data->'data'->>'city','')) not between 2 and 100
      or jsonb_typeof(p_data->'data'->'items') is distinct from 'array'
      or jsonb_array_length(p_data->'data'->'items') not between 1 and 20 then raise exception 'MARKET_INVALID'; end if;
    if m.id is null then
      if (select count(*) from public.market_merchants where owner_id=p_actor)>=5 then raise exception 'MARKET_LIMIT'; end if;
      insert into public.market_merchants(owner_id,data) values(p_actor,p_data->'data') returning * into m;
    else
      update public.market_merchants set data=p_data->'data',status='pending',review_note='',version=version+1,updated_at=now() where id=m.id returning * into m;
    end if;
  elsif p_action='pause' then
    update public.market_merchants set status='paused',version=version+1,updated_at=now() where id=m.id returning * into m;
  elsif p_action='admin.review' then
    if coalesce(p_data->>'decision','') not in ('approved','rejected') or length(coalesce(p_data->>'note',''))>1000 then raise exception 'MARKET_INVALID'; end if;
    update public.market_merchants set status=p_data->>'decision',review_note=coalesce(p_data->>'note',''),version=version+1,updated_at=now() where id=m.id returning * into m;
  elsif p_action='admin.payment' then
    if m.status<>'approved' then raise exception 'MARKET_REVIEW_FIRST'; end if;
    v_receipt:=trim(p_data->>'receipt');
    if v_receipt is null or length(v_receipt) not between 3 and 120 or p_data->>'confirmed' is distinct from 'true' then raise exception 'MARKET_INVALID'; end if;
    if exists(select 1 from public.market_payments where merchant_id=m.id and market_payments.receipt=v_receipt) then raise exception 'MARKET_RECEIPT_USED'; end if;
    prior:=m.paid_until;
    update public.market_merchants set paid_until=greatest(coalesce(paid_until,now()),now())+interval '1 month',version=version+1,updated_at=now() where id=m.id returning * into m;
    insert into public.market_payments(merchant_id,recorded_by,receipt,previous_until,paid_until) values(m.id,p_actor,v_receipt,prior,m.paid_until);
  end if;
  result:=jsonb_build_object('id',m.id,'version',m.version,'status',m.status,'paid_until',m.paid_until);
  insert into public.market_mutations(actor_id,mutation_id,fingerprint,result) values(p_actor,mutation,fingerprint,result);
  return result;
end;
$$;
revoke all on function public.lubimka_market(bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.lubimka_market(bigint,text,jsonb) to service_role;
comment on table public.market_payments is 'Manual confirmation of received placement payments. Does not charge a card or process customer orders.';
