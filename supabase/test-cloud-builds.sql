begin;
do $$
declare a uuid; b uuid; request uuid:=gen_random_uuid(); n integer; item record;
begin
 update astra_cloud_settings set enabled=true;
 a:=astra_enqueue_cloud_build(request,'{"task":"synthetic A","builder":"codex"}');
 if astra_enqueue_cloud_build(request,'{"task":"synthetic A","builder":"codex"}')<>a then raise exception 'idempotency failed'; end if;
 b:=astra_enqueue_cloud_build(gen_random_uuid(),'{}');
 begin perform astra_enqueue_cloud_build(gen_random_uuid(),'{}');raise exception 'limit failed';exception when others then if sqlerrm<>'DAILY_BUILD_LIMIT' then raise;end if;end;
 select * into item from astra_claim_cloud_build();
 if item.id is distinct from a then raise exception 'claim failed';end if;
 select count(*) into n from astra_claim_cloud_build();if n<>0 then raise exception 'concurrent claim';end if;
 update astra_cloud_builds set token_hash='test' where id=a;
 for n in 1..12 loop perform astra_charge_build_model(a,'test');end loop;
 select count(*) into n from astra_charge_build_model(a,'test');if n<>0 then raise exception 'model budget exceeded';end if;
 update astra_cloud_builds set status='cancelled',model_calls=0 where id=a;
 select count(*) into n from astra_charge_build_model(a,'test');if n<>0 then raise exception 'cancelled job was billed';end if;
end $$;
rollback;
