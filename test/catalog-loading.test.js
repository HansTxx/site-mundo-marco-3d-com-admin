const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { formatarCPF, aplicarMascaraCPF } = require('../public/cpf');

function fixture() {
  const fields = {};
  function element() { return { value:'', textContent:'', innerHTML:'', disabled:false, hidden:false, attributes:{}, children:[],
    classList:{add(){},remove(){},contains(){return false;}},
    addEventListener(name, callback){this[name]=callback;},setAttribute(name,value){this.attributes[name]=value;},
    replaceChildren(...children){this.children=children;},focus(){} }; }
  const get=id=>fields[id] ||= element();
  const storage=new Map([['minha-loja-dados',JSON.stringify({carrinho:[{id:1,variante:'Pequeno',quantidade:2}],cliente:{nome:'Cliente'},personalizacao:{corTampa:'Azul'}})]]);
  const requests=[]; const timers=[]; const intervals=[];
  const context=vm.createContext({ document:{hidden:false,querySelector:s=>get(s.slice(1)),getElementById:id=>id==='heroImagem'?null:get(id),querySelectorAll:()=>[],addEventListener(){},createElement:element},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:()=>null},
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},setInterval:fn=>intervals.push(fn),AbortController,formatarCPF,aplicarMascaraCPF,console,
    fetch:(url,options)=>new Promise((resolve,reject)=>{requests.push({url,options,resolve,reject});options.signal.addEventListener('abort',()=>reject(new Error('timeout')));}) });
  vm.runInContext(fs.readFileSync(require.resolve('../public/script.js'),'utf8'),context);
  return {context,fields,storage,requests,timers,intervals};
}
const catalog=[{id:1,nome:'Caixa',preco:10,imagem:'imagens/produto1.jpeg',imagens:[],descricao:'Caixa organizadora',variantes:[{nome:'Pequeno'},{nome:'Grande'}]}];
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('consulta API imediatamente e exibe modelos antes do primeiro intervalo',async()=>{
  const f=fixture();
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/produtos');assert.equal(f.requests[0].options.cache,'no-store');
  assert.equal(f.fields.abrirCarrinho.disabled,true);
  assert.equal(vm.runInContext('carrinho.length',f.context),1);
  f.requests[0].resolve({ok:true,json:async()=>catalog});await settle();
  assert.match(f.fields.listaProdutos.innerHTML,/value="Pequeno"/);assert.match(f.fields.listaProdutos.innerHTML,/value="Grande"/);
  assert.equal(f.fields.abrirCarrinho.disabled,false);
  assert.equal(vm.runInContext('carrinho[0].quantidade',f.context),2);
  assert.equal(f.fields.corTampa.value,'Azul');
  assert.equal(f.requests.length,1);
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
  assert.ok(!html.includes('src="/produtos.js"'));
});

test('timeout mantém carrinho e permite tentar novamente sem recarregar',async()=>{
  const f=fixture();const saved=f.storage.get('minha-loja-dados');
  f.timers[0]();await settle();
  assert.equal(f.fields.listaProdutos.children[1].textContent,'Tentar novamente');
  assert.equal(f.fields.abrirCarrinho.disabled,true);assert.equal(f.storage.get('minha-loja-dados'),saved);
  f.fields.listaProdutos.children[1].click();
  assert.equal(f.requests.length,2);
  f.requests[1].resolve({ok:true,json:async()=>catalog});await settle();
  assert.equal(f.fields.abrirCarrinho.disabled,false);assert.equal(vm.runInContext('carrinho.length',f.context),1);
});

test('catálogo vazio termina carregamento; falha posterior preserva catálogo atual',async()=>{
  const f=fixture();f.requests[0].resolve({ok:true,json:async()=>[]});await settle();
  assert.match(f.fields.listaProdutos.innerHTML,/catálogo está sendo preparado/);assert.equal(f.fields.abrirCarrinho.disabled,false);
  const html=f.fields.listaProdutos.innerHTML;
  f.intervals[0]();f.requests[1].resolve({ok:false});await settle();
  assert.equal(f.fields.listaProdutos.innerHTML,html);
});
