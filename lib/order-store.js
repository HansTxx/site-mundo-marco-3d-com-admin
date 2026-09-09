const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// One Node process owns this file. Serialize the entire read/modify/write cycle.
class OrderStore {
  constructor(directory) {
    this.file = path.join(directory, 'pedidos.json');
    this.queue = Promise.resolve();
  }
  async read() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!Array.isArray(data) || data.some((o, i) => !Number.isSafeInteger(o.numero) || o.numero < 1 || (i && o.numero <= data[i - 1].numero))) {
        throw new Error('Arquivo de pedidos inválido. Restaure um backup antes de continuar.');
      }
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error; // Never overwrite corrupt data with an empty list.
    }
  }
  async atomicWrite(file, contents) {
    const temporary = `${file}.${crypto.randomBytes(12).toString('hex')}.tmp`;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      try { await handle.writeFile(contents, 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      await fs.rename(temporary, file);
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }
  add(order, key, fingerprint) {
    const operation = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const orders = await this.read();
      const existing = orders.find(o => o.chave === key);
      if (existing) {
        if (existing.excluidoEm) { const error = new Error('Este pedido foi excluído. Inicie um novo pedido.'); error.status = 409; throw error; }
        if (existing.fingerprint !== fingerprint) {
          const error = new Error('Esta tentativa já foi usada para outro pedido. Atualize a página.');
          error.status = 409; throw error;
        }
        return existing;
      }
      const saved = { ...order, numero: (orders.at(-1)?.numero || 0) + 1,
        dataHora: new Date().toISOString(), chave: key, fingerprint, revisao: 1, status: 'aberto', observacoes: '' };
      await this.atomicWrite(`${this.file}.bak`, JSON.stringify(orders, null, 2));
      await this.atomicWrite(this.file, JSON.stringify([...orders, saved], null, 2));
      return saved;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async list() { await this.queue; return this.read(); }
  change(numero, revisao, transform) {
    const operation = this.queue.then(async () => {
      const orders = await this.read();
      const index = orders.findIndex(o => o.numero === numero && !o.excluidoEm);
      const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
      if (index < 0) fail(404, 'Pedido não encontrado.');
      const current = orders[index];
      if (revisao !== (current.revisao || 1)) fail(409, 'Este pedido foi alterado em outra janela. Feche a edição, atualize a lista e tente novamente.');
      const next = transform(current);
      next.revisao = (current.revisao || 1) + 1;
      next.atualizadoEm = new Date().toISOString();
      const updated = [...orders]; updated[index] = next;
      await this.atomicWrite(`${this.file}.bak`, JSON.stringify(orders, null, 2));
      await this.atomicWrite(this.file, JSON.stringify(updated, null, 2));
      return next;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
module.exports = OrderStore;
