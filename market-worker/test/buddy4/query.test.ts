import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,must} from './helpers';

test('parameterized queries preserve JSONB, sparse patches, defaults, filters, cardinality and upserts',async()=>{
 const{db}=await testDatabase();
 try{
 const inserted=await must<any>(db.from('news_articles').insert({article_url:"https://example.test/a?x='; DROP TABLE news_articles;--",asset:'BTC',title:'Bitcoin',raw_data:{tags:['a','b'],deep:{x:2}},published_at:'2026-10-19T00:00:00Z'}).select().single());
 assert.equal(inserted.analysis_status,'pending');
 assert.deepEqual(inserted.raw_data.deep,{x:2});
 await must(db.from('news_articles').update({summary:'patched'}).eq('id',inserted.id));
 const row=await must<any>(db.from('news_articles').select().eq('id',inserted.id).single());
 assert.equal(row.title,'Bitcoin');assert.equal(row.summary,'patched');
 await must(db.from('news_articles').upsert({article_url:row.article_url,title:'replacement'},{onConflict:'article_url'}));
 await must(db.from('news_articles').upsert({article_url:row.article_url,title:'must not overwrite'},{onConflict:'article_url',ignoreDuplicates:true}));
 assert.equal((await must<any>(db.from('news_articles').select('title').eq('id',row.id).single())).title,'replacement');
 const filtered=await must<any[]>(db.from('news_articles').select('id,tags:raw_data->tags').contains('raw_data',{deep:{x:2}}).not('published_at','is',null).gte('published_at','2026-10-18').lte('published_at','2026-10-20').in('id',[row.id]).order('id',{ascending:false}).range(0,2));
 assert.deepEqual(filtered[0].tags,['a','b']);
 assert.equal((await db.from('news_articles').select('*',{count:'exact',head:true})).count,1);
 assert.equal(await must(db.from('news_articles').select().eq('id',99999).maybeSingle()),null);
 assert.ok((await db.from('news_articles').select().eq('id',99999).single()).error);
 assert.ok((await db.from('news_articles;drop table news_scores').select()).error);
 assert.ok((await db.from('news_articles').select('pg_sleep(30)')).error);
 assert.ok((await db.from('news_articles').order('id;delete from news_scores')).error);
 assert.ok((await db.from('news_articles').update({title:'unsafe'})).error);
 assert.ok((await db.from('news_articles').delete()).error);
 const bad=db.from('news_articles').select().limit(-1);assert.ok((await bad).error);
 await must(db.from('news_articles').delete().eq('id',row.id));
 assert.equal((await must<any[]>(db.from('news_articles').select())).length,0);
 }finally{await db.close();}
});
