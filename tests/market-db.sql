-- Run against the isolated test project. No sample data survives the transaction.
begin;
do $$
declare
 owner_id bigint:=8100000000000101;
 admin_id bigint:=1699772237;
 m uuid;
 v integer;
 payment jsonb;
 first_until timestamptz;
 r jsonb;
 save_body jsonb;
 data jsonb:='{"kind":"store","name":"Тестовая витрина","city":"Москва","address":"Доставка","description":"Тестовые товары для питомцев","contact":"@test_store","photo":null,"items":[{"name":"Ошейник","description":"Тест","price":450,"photo":null}]}';
begin
 if has_table_privilege('anon','public.market_merchants','SELECT') or has_table_privilege('authenticated','public.market_merchants','UPDATE') or has_function_privilege('anon','public.lubimka_market(bigint,text,jsonb)','EXECUTE') then raise exception 'TEST: client grants'; end if;
 save_body:=jsonb_build_object('mutationId',gen_random_uuid(),'data',data);
 r:=public.lubimka_market(owner_id,'save',save_body);m:=(r->>'id')::uuid;v:=(r->>'version')::integer;
 if public.lubimka_market(owner_id,'save',save_body)<>r then raise exception 'TEST: duplicate save'; end if;
 if exists(select 1 from jsonb_array_elements(public.lubimka_market(null,'catalog','{}')->'merchants') t where t->>'id'=m::text) then raise exception 'TEST: pending is public'; end if;
 begin
  perform public.lubimka_market(owner_id+1,'pause',jsonb_build_object('id',m,'baseVersion',v,'mutationId',gen_random_uuid()));
  raise exception 'TEST: foreign edit allowed';
 exception when others then if sqlerrm<>'MARKET_NOT_FOUND' then raise; end if; end;
 begin
  perform public.lubimka_market(owner_id,'admin.review',jsonb_build_object('id',m,'baseVersion',v,'mutationId',gen_random_uuid(),'decision','approved'));
  raise exception 'TEST: fake admin';
 exception when others then if sqlerrm<>'MARKET_FORBIDDEN' then raise; end if; end;
 r:=public.lubimka_market(admin_id,'admin.review',jsonb_build_object('id',m,'baseVersion',v,'mutationId',gen_random_uuid(),'decision','approved'));v:=(r->>'version')::integer;
 begin perform public.lubimka_market(null,'detail',jsonb_build_object('id',m));raise exception 'TEST: unpaid is public';
 exception when others then if sqlerrm<>'MARKET_NOT_FOUND' then raise; end if; end;
 payment:=jsonb_build_object('id',m,'baseVersion',v,'mutationId',gen_random_uuid(),'receipt','test-'||m,'confirmed',true);
 r:=public.lubimka_market(admin_id,'admin.payment',payment);v:=(r->>'version')::integer;first_until:=(r->>'paid_until')::timestamptz;
 if first_until<now()+interval '27 days' then raise exception 'TEST: missing paid period'; end if;
 if public.lubimka_market(admin_id,'admin.payment',payment)<>r then raise exception 'TEST: payment retry mismatch'; end if;
 if (select paid_until from public.market_merchants where id=m)<>first_until then raise exception 'TEST: double extension'; end if;
 if public.lubimka_market(null,'detail',jsonb_build_object('id',m))->'merchant'->'data'->>'name'<>'Тестовая витрина' then raise exception 'TEST: public detail'; end if;
 if not exists(select 1 from jsonb_array_elements(public.lubimka_market(null,'catalog','{"query":"ОШЕЙНИК","city":"москва"}')->'merchants') t where t->>'id'=m::text) then raise exception 'TEST: product search'; end if;
 begin
  perform public.lubimka_market(admin_id,'admin.payment',payment||jsonb_build_object('mutationId',gen_random_uuid(),'baseVersion',v));raise exception 'TEST: duplicate receipt';
 exception when others then if sqlerrm<>'MARKET_RECEIPT_USED' then raise; end if; end;
 begin
  perform public.lubimka_market(owner_id,'save',jsonb_build_object('id',m,'baseVersion',1,'mutationId',gen_random_uuid(),'data',data));raise exception 'TEST: stale edit';
 exception when others then if sqlerrm<>'MARKET_CONFLICT' then raise; end if; end;
 update public.market_merchants set paid_until=now()-interval '1 second' where id=m;
 begin perform public.lubimka_market(null,'detail',jsonb_build_object('id',m));raise exception 'TEST: expired is public';
 exception when others then if sqlerrm<>'MARKET_NOT_FOUND' then raise; end if; end;
 update public.market_merchants set paid_until=first_until where id=m;
 r:=public.lubimka_market(owner_id,'save',jsonb_build_object('id',m,'baseVersion',v,'mutationId',gen_random_uuid(),'data',data));
 if r->>'status'<>'pending' or (r->>'paid_until')::timestamptz<>first_until then raise exception 'TEST: edit lost payment or skipped review'; end if;
 if exists(select 1 from jsonb_array_elements(public.lubimka_market(null,'catalog','{}')->'merchants') t where t->>'id'=m::text) then raise exception 'TEST: edited listing is public'; end if;
 if public.lubimka_market(admin_id,'admin.detail',jsonb_build_object('id',m))->'merchant'->'data'->'items' is null then raise exception 'TEST: admin detail'; end if;
 if exists(select 1 from jsonb_array_elements(public.lubimka_market(admin_id,'admin.list','{}')->'merchants') t where t->'data' ? 'items') then raise exception 'TEST: admin list includes heavy products'; end if;
end $$;
select 'PASS: ownership, moderation, expiry, idempotency, duplicate payment, version conflicts, private grants and admin reads' as result;
rollback;
