const fs = require('node:fs/promises');
const path = require('node:path');
const OrderStore = require('./order-store');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function validate(input) {
  const p = {};
  for (const [key, max] of [['nome', 300], ['descricao', 5000]]) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max) fail(400, `Campo inválido: ${key}.`);
    p[key] = input[key].trim();
  }
  for (const [key, max, scale] of [['preco', 100000, 100], ['peso', 1000, 1000], ['largura', 1000, 100], ['comprimento', 1000, 100], ['altura', 1000, 100]]) {
    const n = input[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > max || Math.abs(n * scale - Math.round(n * scale)) > 0.000001) fail(400, `Campo inválido: ${key}. Use um número positivo com até ${scale === 1000 ? 3 : 2} casas decimais (máximo ${max}).`);
    p[key] = Math.round(n * scale) / scale;
  }
  if (!Array.isArray(input.imagens) || input.imagens.length < 1 || input.imagens.length > 20) fail(400, 'Adicione de 1 a 20 imagens.');
  p.imagens = input.imagens.map(value => {
    if (typeof value !== 'string' || value.length > 2048 || !/^(?:\/?imagens\/[a-zA-Z0-9_./-]+\.(?:jpe?g|png|webp|gif|svg)|\/media\/[a-f0-9]{64}\.(?:jpg|png|webp|gif))$/.test(value) || value.includes('..')) fail(400, 'Imagem inválida. Use o envio de arquivos.');
    return value;
  });
  p.imagem = p.imagens[0];
  return p;
}
class ProductStore extends OrderStore {
  constructor(directory, seed) {
    super(directory); this.file = path.join(directory, 'produtos.json'); this.seed = seed;
    this.queue = this.initialize();
    this.queue.catch(() => {}); // Surface initialization failures to API callers.
  }
  async initialize() {
    try { await fs.access(this.file); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const products = await this.read();
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      await this.atomicWrite(this.file, JSON.stringify(products, null, 2));
    }
  }
  async read() {
    let data;
    try { data = JSON.parse(await fs.readFile(this.file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      data = this.seed.map(p => ({ ...p, imagens: [...new Set([p.imagem, ...(p.imagens || [])].filter(Boolean))], revisao: 1 }));
    }
    if (!Array.isArray(data)) throw new Error('Catálogo corrompido. Restaure o backup.');
    const ids = new Set();
    for (const p of data) {
      if (!Number.isSafeInteger(p.id) || p.id < 1 || ids.has(p.id) || !Number.isSafeInteger(p.revisao) || p.revisao < 1) throw new Error('Catálogo corrompido.');
      ids.add(p.id); validate(p);
    }
    return data;
  }
  save(input, id, remove = false) {
    const operation = this.queue.then(async () => {
      const all = await this.read();
      const index = all.findIndex(p => p.id === id && !p.excluidoEm);
      if (id !== undefined && index < 0) fail(404, 'Produto não encontrado.');
      const current = all[index];
      if (current && input.revisao !== current.revisao) fail(409, 'Produto alterado em outra janela. Atualize o catálogo e abra novamente.');
      const next = remove ? { ...current, excluidoEm: new Date().toISOString(), revisao: current.revisao + 1 }
        : { ...current, ...validate(input), id: current?.id || Math.max(0, ...all.map(p => p.id)) + 1, revisao: (current?.revisao || 0) + 1 };
      const updated = [...all]; if (current) updated[index] = next; else updated.push(next);
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      await this.atomicWrite(this.file + '.bak', JSON.stringify(all, null, 2));
      await this.atomicWrite(this.file, JSON.stringify(updated, null, 2));
      return next;
    });
    this.queue = operation.catch(() => {}); return operation;
  }
  async list() { await this.queue; return (await this.read()).filter(p => !p.excluidoEm); }
  async parcel(items) {
    if (!Array.isArray(items) || !items.length || items.length > 100) fail(400, 'Carrinho inválido.');
    const catalog = await this.list(); const seen = new Set();
    const parcel = { peso: 0, largura: 0, altura: 0, comprimento: 0, valorDeclarado: 0 };
    for (const item of items) {
      const p = catalog.find(p => p.id === item?.id);
      if (!p || seen.has(p.id) || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 999) fail(400, 'Produto indisponível ou quantidade inválida. Atualize o catálogo.');
      seen.add(p.id);
      parcel.peso += p.peso * item.quantidade;
      parcel.altura += p.altura * item.quantidade;
      parcel.largura = Math.max(parcel.largura, p.largura);
      parcel.comprimento = Math.max(parcel.comprimento, p.comprimento);
      parcel.valorDeclarado += Math.round(p.preco * 100) * item.quantidade / 100;
    }
    for (const key in parcel) parcel[key] = Number(parcel[key].toFixed(3));
    return parcel;
  }
}
module.exports = ProductStore;
