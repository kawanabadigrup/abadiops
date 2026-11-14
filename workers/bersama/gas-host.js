// Fungsi bantu dari luar konteks GAS untuk workers/bersama/gas-layanan.js (Utilities.computeDigest, getUuid,
// base64Encode). Sinkron, karena kode GAS memanggilnya sinkron; di Worker butuh compatibility flag nodejs_compat.
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

const ALGORITMA = { MD2: 'md2', MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256', SHA_384: 'sha384', SHA_512: 'sha512' };

function bytes(isiJson) {
  const p = JSON.parse(isiJson);
  return p.b ? Buffer.from(p.b.map((x) => x & 255)) : Buffer.from(p.s, 'utf8');
}

export function buatHost() {
  return {
    uuid: () => randomUUID(),
    // Byte bertanda (-128..127), sama dengan Byte[] yang dikembalikan GAS.
    digest: (alg, isiJson) => JSON.stringify([...createHash(ALGORITMA[alg]).update(bytes(isiJson)).digest()].map((x) => (x > 127 ? x - 256 : x))),
    b64: (isiJson, websafe) => {
      const s = bytes(isiJson).toString('base64');
      return websafe ? s.replace(/\+/g, '-').replace(/\//g, '_') : s;
    },
  };
}
