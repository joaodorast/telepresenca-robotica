// Tokens assinados com HMAC-SHA256 (formato compacto: base64url(payload).base64url(assinatura)).
// São stateless: o servidor pode reiniciar sem invalidar sessões em andamento.
import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function createTokenService(secret) {
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres.');
  }
  const key = Buffer.from(secret, 'utf8');

  const sign = (payload) => {
    const body = b64url(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
    return `${body}.${sig}`;
  };

  const verify = (token) => {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', key).update(body).digest();
    let given;
    try {
      given = Buffer.from(sig, 'base64url');
    } catch {
      return null;
    }
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  };

  return { sign, verify };
}

/** Comparação de senha em tempo constante (independe do tamanho). */
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export const randomId = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url');
