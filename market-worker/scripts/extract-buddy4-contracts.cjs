const ts=require('typescript'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');const repo=path.resolve(root,'..');
const cfg=ts.readConfigFile(root+'/tsconfig.json',ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,root);
const program=ts.createProgram([...parsed.fileNames,...ts.sys.readDirectory(repo+'/marketmind-ai',['.ts','.tsx'],['node_modules','.next'])],parsed.options),ck=program.getTypeChecker();
const tables={},reads={},sources={};
function tableOf(n){if(!n)return null;if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){const p=n.expression;if(p.name.text==='from'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))return n.arguments[0].text;return tableOf(p.expression);}return null;}
function classify(t){
 if(t.isUnion()){let a=[...new Set(t.types.filter(x=>!(x.flags&(ts.TypeFlags.Null|ts.TypeFlags.Undefined|ts.TypeFlags.Never))).map(classify))];return a.length===1?a[0]:a.includes('numeric')&&a.every(x=>['numeric','text'].includes(x))?'numeric':'unknown';}
 if(t.flags&ts.TypeFlags.NumberLike)return 'numeric';if(t.flags&ts.TypeFlags.BooleanLike)return 'boolean';if(t.flags&(ts.TypeFlags.StringLike|ts.TypeFlags.TemplateLiteral))return 'text';if(t.flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown|ts.TypeFlags.Null|ts.TypeFlags.Undefined))return 'unknown';return 'jsonb';
}
function add(t,name,typ,loc){if(!/^[a-z][a-z_0-9]*$/.test(name))return;tables[t]??={}; const sql=classify(typ);if(!tables[t][name]||tables[t][name]==='unknown')tables[t][name]=sql;(sources[t]??=new Set()).add(loc.getSourceFile().fileName.replace(repo+'/',''));}
function props(table,t,loc){if(ck.isArrayType(t))t=ck.getTypeArguments(t)[0];for(const p of t.getProperties()){const d=p.valueDeclaration||p.declarations?.[0];if(d)add(table,p.name,ck.getTypeOfSymbolAtLocation(p,d),loc);}}
function resolve(arg,depth=0){if(!arg||depth>4)return [];if(ts.isParenthesizedExpression(arg))return resolve(arg.expression,depth+1);if(ts.isObjectLiteralExpression(arg))return [arg];if(ts.isIdentifier(arg)){const s=ck.getSymbolAtLocation(arg);return (s?.declarations??[]).flatMap(d=>d.initializer?resolve(d.initializer,depth+1):[]);}if(ts.isCallExpression(arg)){const d=ck.getResolvedSignature(arg)?.declaration;if(d?.body){let a=[];function v(n){if(ts.isReturnStatement(n)&&n.expression)a.push(...resolve(n.expression,depth+1));else ts.forEachChild(n,v);}v(d.body);return a;}}return [];}
for(const sf of program.getSourceFiles()){
 if(!sf.fileName.startsWith(repo+'/')||sf.fileName.includes('node_modules')||sf.fileName.endsWith('.test.ts'))continue;
 function visit(n){
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){
   const table=tableOf(n.expression.expression),method=n.expression.name.text,arg=n.arguments[0];
   if(table&&arg){
    if(['insert','upsert','update'].includes(method)){
     props(table,ck.getTypeAtLocation(arg),arg);
     for(const obj of resolve(arg))props(table,ck.getTypeAtLocation(obj),obj);
    }
    if(['select','eq','neq','gt','gte','lt','lte','order','in','is','not'].includes(method)&&ts.isStringLiteralLike(arg)){
     const list=method==='select'?arg.text.split(','):[arg.text];
     for(const col of list.map(x=>x.trim()).filter(x=>/^[a-z][a-z_0-9]*$/.test(x)))(reads[table]??=new Set()).add(col);
    }
   }
  }
  ts.forEachChild(n,visit);
 }visit(sf);
}
const typeMap={PaperTradingAccount:'paper_trading_accounts',PaperStrategyConfig:'paper_strategy_configs',PaperPosition:'paper_positions',PaperTrade:'paper_trades'};
const sf=program.getSourceFile(repo+'/marketmind-ai/dashboard/types.ts');
for(const n of sf.statements)if(n.name&&typeMap[n.name.text])props(typeMap[n.name.text],ck.getTypeAtLocation(n),n);
for(const [file,fn,table] of [['src/etf/score.ts','calculateEtfScore','etf_scores'],['src/optimization/run-strategy-performance-analyzer.ts','buildSnapshot','strategy_performance_snapshots']]){
 const sf=program.getSourceFile(root+'/'+file);for(const n of sf.statements)if(ts.isFunctionDeclaration(n)&&n.name?.text===fn){function v(n){if(ts.isReturnStatement(n)&&n.expression&&ts.isObjectLiteralExpression(n.expression))props(table,ck.getTypeAtLocation(n.expression),n);else ts.forEachChild(n,v);}v(n.body);}
}
fs.writeFileSync(path.join(root,'migrations/buddy4/source-contracts.json'),JSON.stringify({tables,reads:Object.fromEntries(Object.entries(reads).map(([t,c])=>[t,[...c]])),sources:Object.fromEntries(Object.entries(sources).map(([t,s])=>[t,[...s]]))},null,2));
console.log('write contracts',Object.keys(tables).length);console.log('unknowns',Object.entries(tables).flatMap(([t,c])=>Object.entries(c).filter(([k,v])=>v==='unknown').map(([k])=>t+'.'+k)));
console.log('read only columns',Object.entries(reads).map(([t,cs])=>[t,[...cs].filter(c=>!tables[t]?.[c])]).filter(([t,cs])=>cs.length));
