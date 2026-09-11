const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(crypto.scrypt);
const OrderStore = require('./order-store');
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const equal = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
class Accounts {
  constructor(directory, env = process.env) {
    this.file = path.join(directory, 'admin-account.json');
    this.writer = new OrderStore(directory);
    this.queue = Promise.resolve();
    this.seedUser = env.ADMIN_USER || ''; this.seedPassword = env.ADMIN_PASSWORD || '';
    this.masterUser = env.MASTER_USER || ''; this.masterPassword = env.MASTER_PASSWORD || '';
  }
  serial(fn) { const result = this.queue.then(fn); this.queue = result.catch(() => {}); return result; }
  async hash(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await derive(password, salt, 64)).toString('hex');
    return { salt, hash };
  }
  async matches(password, account) {
    if (typeof password !== 'string' || password.length > 500) return false;
    const value = await derive(password, account.salt, 64);
    return crypto.timingSafeEqual(value, Buffer.from(account.hash, 'hex'));
  }
  async read() {
    try {
      const a = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (a.schema !== 1 || typeof a.usuario !== 'string' || !a.usuario || !/^[a-f0-9]{32}$/.test(a.salt) || !/^[a-f0-9]{128}$/.test(a.hash) || !/^[a-f0-9]{32}$/.test(a.revisao)) throw new Error('Invalid account');
      return a;
    } catch (error) { if (error.code === 'ENOENT') return null; fail(503, 'Arquivo de acesso indisponível. Verifique o servidor; nenhum dado foi substituído.'); }
  }
  async write(usuario, password) {
    const a = { schema: 1, usuario, ...await this.hash(password), revisao: crypto.randomBytes(16).toString('hex'), atualizadoEm: new Date().toISOString() };
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await this.writer.atomicWrite(this.file, JSON.stringify(a, null, 2));
    return a;
  }
  masterOK(user, password) {
    return Boolean(this.masterUser && this.masterPassword && typeof user === 'string' && typeof password === 'string' && equal(user, this.masterUser) && equal(password, this.masterPassword));
  }
  authenticate(user, password) {
    return this.serial(async () => {
      if (this.masterOK(user, password)) return { role: 'master', usuario: this.masterUser };
      // Reserve the master username even when only one setting was configured.
      if (user === this.masterUser && this.masterUser) return null;
      let a = await this.read();
      if (!a) {
        if (!this.seedUser || !this.seedPassword) return null;
        if (typeof user !== 'string' || typeof password !== 'string' || !equal(user, this.seedUser) || !equal(password, this.seedPassword)) return null;
        a = await this.write(this.seedUser, this.seedPassword);
      } else if (!equal(user, a.usuario) || !await this.matches(password, a)) return null;
      return { role: 'admin', usuario: a.usuario, revisao: a.revisao };
    });
  }
  async valid(session) {
    if (session.role === 'master') return Boolean(this.masterUser && this.masterPassword && session.usuario === this.masterUser);
    const a = await this.read(); return Boolean(a && session.revisao === a.revisao);
  }
  change(session, body) {
    return this.serial(async () => {
      if (typeof body.usuario !== 'string' || !/^[\p{L}\p{N}_.@-]{3,80}$/u.test(body.usuario)) fail(400, 'Use um usuário de 3 a 80 caracteres, sem espaços.');
      if (body.usuario === this.masterUser) fail(400, 'Esse usuário está reservado. Escolha outro.');
      if (typeof body.novaSenha !== 'string' || body.novaSenha.length < 12 || body.novaSenha.length > 200) fail(400, 'A nova senha deve ter entre 12 e 200 caracteres.');
      if (body.novaSenha !== body.confirmacao) fail(400, 'A confirmação da nova senha não confere.');
      const a = await this.read();
      if (session.role === 'master') {
        if (!this.masterOK(session.usuario, body.senhaAtual)) fail(400, 'Senha atual incorreta.');
      } else {
        if (!a || a.revisao !== session.revisao) fail(401, 'Entre novamente para alterar seu acesso.');
        if (!await this.matches(body.senhaAtual, a)) fail(400, 'Senha atual incorreta.');
      }
      await this.write(body.usuario, body.novaSenha);
    });
  }
}
module.exports = Accounts;
