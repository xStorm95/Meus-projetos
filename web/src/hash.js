/*
 * Hash de senhas (PBKDF2-HMAC-SHA256) sem dependências.
 *
 * Primário: Web Crypto (crypto.subtle) — 210.000 iterações.
 * Fallback: implementação própria de SHA-256/HMAC/PBKDF2, para navegadores
 * que não expõem crypto.subtle em contexto file:// (ex.: Safari antigo).
 *
 * Formato armazenado: pbkdf2$<iterações>$<salt base64>$<hash base64>
 * A senha em texto puro NUNCA é gravada.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PassarelaHash = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  /** SHA-256 de um Uint8Array → Uint8Array(32). */
  function sha256(msg) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = msg.length;
    var bitLenHi = Math.floor(len / 536870912);
    var bitLenLo = (len << 3) >>> 0;
    var padded = new Uint8Array(Math.ceil((len + 9) / 64) * 64);
    padded.set(msg);
    padded[len] = 0x80;
    var dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, bitLenHi);
    dv.setUint32(padded.length - 4, bitLenLo);

    var w = new Uint32Array(64);
    for (var off = 0; off < padded.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e;
        e = (d + t1) >>> 0;
        d = c; c = b; b = a;
        a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var out = new Uint8Array(32);
    var odv = new DataView(out.buffer);
    for (i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }

  function concat() {
    var total = 0, i;
    for (i = 0; i < arguments.length; i++) total += arguments[i].length;
    var out = new Uint8Array(total), pos = 0;
    for (i = 0; i < arguments.length; i++) {
      out.set(arguments[i], pos);
      pos += arguments[i].length;
    }
    return out;
  }

  function hmacSha256(key, msg) {
    if (key.length > 64) key = sha256(key);
    var k = new Uint8Array(64);
    k.set(key);
    var ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (var i = 0; i < 64; i++) {
      ipad[i] = k[i] ^ 0x36;
      opad[i] = k[i] ^ 0x5c;
    }
    return sha256(concat(opad, sha256(concat(ipad, msg))));
  }

  /** PBKDF2-HMAC-SHA256 com saída de 32 bytes (um bloco). */
  function pbkdf2Js(passwordBytes, saltBytes, iterations) {
    var block = concat(saltBytes, new Uint8Array([0, 0, 0, 1]));
    var u = hmacSha256(passwordBytes, block);
    var out = new Uint8Array(u);
    for (var i = 1; i < iterations; i++) {
      u = hmacSha256(passwordBytes, u);
      for (var j = 0; j < out.length; j++) out[j] ^= u[j];
    }
    return out;
  }

  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function bytesToBase64(bytes) {
    var out = "", i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rest = bytes.length - i;
    if (rest === 1) {
      var n1 = bytes[i] << 16;
      out += B64[(n1 >> 18) & 63] + B64[(n1 >> 12) & 63] + "==";
    } else if (rest === 2) {
      var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64[(n2 >> 18) & 63] + B64[(n2 >> 12) & 63] + B64[(n2 >> 6) & 63] + "=";
    }
    return out;
  }

  function base64ToBytes(str) {
    var clean = String(str).replace(/[^A-Za-z0-9+/=]/g, "");
    var out = [];
    for (var i = 0; i < clean.length; i += 4) {
      var c1 = B64.indexOf(clean[i]);
      var c2 = B64.indexOf(clean[i + 1]);
      var c3 = B64.indexOf(clean[i + 2]);
      var c4 = B64.indexOf(clean[i + 3]);
      out.push(((c1 << 2) | (c2 >> 4)) & 255);
      if (c3 >= 0) out.push(((c2 << 4) | (c3 >> 2)) & 255);
      if (c4 >= 0) out.push(((c3 << 6) | c4) & 255);
    }
    return new Uint8Array(out);
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
    var s = unescape(encodeURIComponent(text));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function randomBytes(n) {
    var out = new Uint8Array(n);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(out);
      return out;
    }
    for (var i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }

  function hasSubtle() {
    return (
      typeof crypto !== "undefined" &&
      crypto.subtle &&
      typeof crypto.subtle.importKey === "function" &&
      typeof TextEncoder !== "undefined"
    );
  }

  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  var SUBTLE_ITERATIONS = 210000;
  var JS_ITERATIONS = 25000;

  async function hashPassword(password) {
    var salt = randomBytes(16);
    if (hasSubtle()) {
      try {
        var key = await crypto.subtle.importKey("raw", utf8Bytes(password), "PBKDF2", false, ["deriveBits"]);
        var bits = await crypto.subtle.deriveBits(
          { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: SUBTLE_ITERATIONS },
          key,
          256
        );
        return "pbkdf2$" + SUBTLE_ITERATIONS + "$" + bytesToBase64(salt) + "$" + bytesToBase64(new Uint8Array(bits));
      } catch (err) {
        /* cai no fallback abaixo */
      }
    }
    var hash = pbkdf2Js(utf8Bytes(password), salt, JS_ITERATIONS);
    return "pbkdf2$" + JS_ITERATIONS + "$" + bytesToBase64(salt) + "$" + bytesToBase64(hash);
  }

  async function verifyPassword(password, stored) {
    var parts = String(stored || "").split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    var iterations = parseInt(parts[1], 10);
    if (!iterations || iterations < 1) return false;
    var salt = base64ToBytes(parts[2]);
    var expected = base64ToBytes(parts[3]);

    if (hasSubtle()) {
      try {
        var key = await crypto.subtle.importKey("raw", utf8Bytes(password), "PBKDF2", false, ["deriveBits"]);
        var bits = await crypto.subtle.deriveBits(
          { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iterations },
          key,
          expected.length * 8
        );
        return constantTimeEqual(new Uint8Array(bits), expected);
      } catch (err) {
        /* fallback */
      }
    }
    var derived = pbkdf2Js(utf8Bytes(password), salt, iterations);
    return constantTimeEqual(derived, expected);
  }

  /** Token de sessão (32 bytes aleatórios em hexadecimal). */
  function randomToken() {
    var bytes = randomBytes(32);
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += ("0" + bytes[i].toString(16)).slice(-2);
    return out;
  }

  return {
    sha256: sha256,
    hmacSha256: hmacSha256,
    pbkdf2: pbkdf2Js,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    hashPassword: hashPassword,
    verifyPassword: verifyPassword,
    randomToken: randomToken,
    hasSubtle: hasSubtle
  };
});
