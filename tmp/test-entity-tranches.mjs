import {PGlite} from './gate2025/runtime/node_modules/@electric-sql/pglite/dist/index.js';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();await db.exec(`create role authenticated;create table entity("Id" integer primary key,name text,"EntityName" text,"IsActive" int,"IsDeleted" int);insert into entity values(1,'Emerging Markets Fund',null,1,0),(2,'Mid Cap Growth Fund',null,1,0),(3,'Credit Fund',null,1,0);create table fund_closes(id int,editor_data jsonb);`);
const sql=readFileSync('supabase/entity_tranches.sql','utf8');await db.exec(sql);await db.exec(sql);assert.equal((await db.query('select * from entity_tranche')).rows.length,5);
const t=(await db.query('select * from entity_tranche where entity_id=1 limit 1')).rows[0];
await db.query('insert into fund_closes values(1,$1::jsonb)',[JSON.stringify({accounts:{A:{allocationMappings:[{entityId:1,trancheId:t.id}]}}})]);
await assert.rejects(()=>db.query('insert into fund_closes values(2,$1::jsonb)',[JSON.stringify({accounts:{A:{allocationMappings:[{entityId:2,trancheId:t.id}]}}})]));
await assert.rejects(()=>db.exec(`update entity_tranche set entity_id=2 where id=${t.id}`));
assert.equal((await db.query("select count(*)::int n from entity_tranche where name='Credit Fund'")).rows[0].n,1);
console.log('PASS: mixed seed names, multiple tranches per entity, rerun, ownership cannot change, valid close saves, cross-entity tranche rejected.');await db.close();
