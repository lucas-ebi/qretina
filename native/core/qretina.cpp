#include "qretina.hpp"

#include <algorithm>
#include <cstring>
#include <limits>
#include <stdexcept>

namespace qretina {

// ---- PRNG and masks -------------------------------------------------------------------

uint32_t mulberry32(uint32_t &state) {
  state += 0x6D2B79F5u;
  uint32_t t = (state ^ (state >> 15)) * (state | 1u);
  t = (t + (t ^ (t >> 7)) * (t | 61u)) ^ t;
  return t ^ (t >> 14);
}

std::vector<uint64_t> mask(uint32_t seed, uint32_t n) {
  // The spec draws 32-bit words; pairs of them make one 64-bit word, low word first.
  const size_t w32 = (n + 31) / 32;
  std::vector<uint64_t> m((n + 63) / 64, 0);
  for (size_t i = 0; i < w32; i++) m[i / 2] |= uint64_t(mulberry32(seed)) << (32 * (i % 2));
  if (n % 64) m.back() &= (uint64_t(1) << (n % 64)) - 1;
  return m;
}

// ---- Base45 (RFC 9285) --------------------------------------------------------------------

static constexpr char B45[] = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

static int b45index(char c) {
  const char *p = static_cast<const char *>(std::memchr(B45, c, 45));
  return p ? int(p - B45) : -1;
}

std::string b45encode(const uint8_t *data, size_t len) {
  std::string s;
  s.reserve(len / 2 * 3 + 2);
  for (size_t i = 0; i < len; i += 2) {
    if (i + 1 < len) {
      uint32_t v = data[i] * 256u + data[i + 1];
      s += B45[v % 45], s += B45[v / 45 % 45], s += B45[v / 2025];
    } else {
      s += B45[data[i] % 45], s += B45[data[i] / 45];
    }
  }
  return s;
}

std::optional<Bytes> b45decode(std::string_view s) {
  if (s.size() % 3 == 1) return std::nullopt;
  Bytes out;
  out.reserve(s.size() / 3 * 2 + 1);
  for (size_t i = 0; i < s.size(); i += 3) {
    const bool full = i + 2 < s.size();
    const int a = b45index(s[i]), b = b45index(s[i + 1]), c = full ? b45index(s[i + 2]) : 0;
    if (a < 0 || b < 0 || c < 0) return std::nullopt;
    const uint32_t v = a + b * 45u + c * 2025u;
    if (v > (full ? 65535u : 255u)) return std::nullopt;
    if (full) out.push_back(uint8_t(v >> 8));
    out.push_back(uint8_t(v & 255));
  }
  return out;
}

// ---- SHA-256 (FIPS 180-4) ---------------------------------------------------------------------

std::array<uint8_t, 32> sha256(const uint8_t *data, size_t len) {
  static constexpr uint32_t K[64] = {
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
      0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
      0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
      0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
      0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
      0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};
  uint32_t h[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
  auto rotr = [](uint32_t x, int r) { return (x >> r) | (x << (32 - r)); };
  Bytes msg(data, data + len);
  msg.push_back(0x80);
  while (msg.size() % 64 != 56) msg.push_back(0);
  for (int i = 7; i >= 0; i--) msg.push_back(uint8_t((uint64_t(len) * 8) >> (8 * i)));
  for (size_t off = 0; off < msg.size(); off += 64) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++) w[i] = uint32_t(msg[off + 4 * i]) << 24 | uint32_t(msg[off + 4 * i + 1]) << 16 | uint32_t(msg[off + 4 * i + 2]) << 8 | msg[off + 4 * i + 3];
    for (int i = 16; i < 64; i++) {
      const uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (int i = 0; i < 64; i++) {
      const uint32_t t1 = k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
      const uint32_t t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      k = g, g = f, f = e, e = d + t1, d = c, c = b, b = a, a = t1 + t2;
    }
    h[0] += a, h[1] += b, h[2] += c, h[3] += d, h[4] += e, h[5] += f, h[6] += g, h[7] += k;
  }
  std::array<uint8_t, 32> out;
  for (int i = 0; i < 32; i++) out[i] = uint8_t(h[i / 4] >> (24 - 8 * (i % 4)));
  return out;
}

std::string hex(const uint8_t *data, size_t len) {
  static constexpr char H[] = "0123456789ABCDEF";
  std::string s;
  for (size_t i = 0; i < len; i++) s += H[data[i] >> 4], s += H[data[i] & 15];
  return s;
}

std::string streamId(const Bytes &container) { return hex(sha256(container.data(), container.size()).data(), 8); }

// ---- Frames: <protocol>/<stream id>/<n>/<len>/<seed>/<base45 symbol> ---------------------------

// Reads 1..maxDigits ASCII digits followed by '/', advancing `p`.
static std::optional<uint64_t> number(std::string_view s, size_t &p, size_t maxDigits) {
  uint64_t v = 0;
  size_t start = p;
  while (p < s.size() && s[p] >= '0' && s[p] <= '9' && p - start < maxDigits) v = v * 10 + (s[p++] - '0');
  if (p == start || p >= s.size() || s[p] != '/') return std::nullopt;
  p++;
  return v;
}

std::optional<Frame> parseFrame(std::string_view raw) {
  if (raw.size() < PROTOCOL.size() + 18 || raw.substr(0, PROTOCOL.size()) != PROTOCOL || raw[PROTOCOL.size()] != '/') return std::nullopt;
  size_t p = PROTOCOL.size() + 1;
  for (size_t i = 0; i < 16; i++) {
    const char c = raw[p + i];
    if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F'))) return std::nullopt;
  }
  Frame f;
  f.id = std::string(raw.substr(p, 16));
  p += 16;
  if (raw[p++] != '/') return std::nullopt;
  const auto n = number(raw, p, 4), len = number(raw, p, 7), seed = number(raw, p, 10);
  if (!n || !len || !seed) return std::nullopt;
  const std::string_view sym = raw.substr(p);
  if (sym.empty()) return std::nullopt;
  for (char c : sym) if (b45index(c) < 0) return std::nullopt;
  if (!(*n >= 1 && *n <= MAX_N && *len >= 2 && *len <= MAX_LEN && *n <= *len && *seed <= std::numeric_limits<uint32_t>::max())) return std::nullopt;
  const uint64_t b = (*len + *n - 1) / *n;
  if (b > MAX_B || sym.size() != b / 2 * 3 + (b % 2) * 2) return std::nullopt;
  auto data = b45decode(sym);
  if (!data) return std::nullopt;
  f.n = uint32_t(*n), f.len = uint32_t(*len), f.seed = uint32_t(*seed), f.data = std::move(*data);
  return f;
}

// ---- Encoder ------------------------------------------------------------------------------

Encoder::Encoder(const Bytes &container, uint32_t block) : len(uint32_t(container.size())) {
  n = uint32_t((container.size() + block - 1) / block);
  if (container.size() < 2 || container.size() > MAX_LEN || n > MAX_N) throw std::invalid_argument("container out of bounds");
  b = (len + n - 1) / n;
  if (b > MAX_B) throw std::invalid_argument("block out of bounds");
  id = streamId(container);
  words_ = (b + 7) / 8;
  blocks_.assign(size_t(n) * words_, 0);
  for (uint32_t j = 0; j < n; j++) {
    const size_t from = size_t(j) * b, count = std::min<size_t>(b, len - std::min<size_t>(len, from));
    std::memcpy(&blocks_[j * words_], container.data() + from, count);
  }
}

std::string Encoder::frame(uint32_t seed) const {
  const auto m = mask(seed, n);
  std::vector<uint64_t> s(words_, 0);
  for (uint32_t j = 0; j < n; j++) {
    if (!((m[j / 64] >> (j % 64)) & 1)) continue;
    const uint64_t *blk = &blocks_[j * words_];
    for (size_t k = 0; k < words_; k++) s[k] ^= blk[k];
  }
  return std::string(PROTOCOL) + '/' + id + '/' + std::to_string(n) + '/' + std::to_string(len) + '/' + std::to_string(seed) + '/' +
         b45encode(reinterpret_cast<const uint8_t *>(s.data()), b);
}

// ---- Decoder: incremental Gaussian elimination over GF(2) ---------------------------------------
// Row j, when present, has its lowest coefficient at column j, so its words below j / 64 are zero
// and reduction only touches the words from there on.

Decoder::Decoder(uint32_t n_, uint32_t len_) : n(n_), len(len_), b((len_ + n_ - 1) / n_) {
  cw_ = (n + 63) / 64;
  dw_ = (b + 7) / 8;
  coef_.assign(size_t(n) * cw_, 0);
  data_.assign(size_t(n) * dw_, 0);
  has_.assign(n, false);
}

static int lowest(const uint64_t *c, size_t from, size_t words) {
  for (size_t i = from; i < words; i++) if (c[i]) return int(i * 64 + __builtin_ctzll(c[i]));
  return -1;
}

bool Decoder::add(uint32_t seed, const Bytes &symbol) {
  if (rank == n || symbol.size() != b || !seen_.insert(seed).second) return rank == n;
  std::vector<uint64_t> c = mask(seed, n), d(dw_, 0);
  std::memcpy(d.data(), symbol.data(), b);
  for (int j = lowest(c.data(), 0, cw_); j >= 0; j = lowest(c.data(), j / 64, cw_)) {
    if (!has_[j]) {
      std::memcpy(&coef_[j * cw_], c.data(), cw_ * 8);
      std::memcpy(&data_[j * dw_], d.data(), dw_ * 8);
      has_[j] = true;
      rank++;
      break;
    }
    const uint64_t *rc = &coef_[j * cw_], *rd = &data_[j * dw_];
    for (size_t k = j / 64; k < cw_; k++) c[k] ^= rc[k];
    for (size_t k = 0; k < dw_; k++) d[k] ^= rd[k];
  }
  return rank == n;
}

Bytes Decoder::solve() {
  if (rank != n) throw std::logic_error("not enough symbols");
  // Back-substitution from the last row: rows after j are already solved in place.
  for (int j = int(n) - 1; j >= 0; j--) {
    const uint64_t *c = &coef_[j * cw_];
    uint64_t *d = &data_[j * dw_];
    for (int k = lowest(c, j / 64, cw_); k >= 0; ) {
      if (k > j) {
        const uint64_t *dk = &data_[size_t(k) * dw_];
        for (size_t w = 0; w < dw_; w++) d[w] ^= dk[w];
      }
      // Next set bit after k.
      const size_t w = size_t(k) / 64;
      const uint64_t rest = (k % 64 == 63) ? 0 : c[w] & (~uint64_t(0) << (k % 64 + 1));
      k = rest ? int(w * 64 + __builtin_ctzll(rest)) : lowest(c, w + 1, cw_);
    }
  }
  Bytes out(len);
  for (uint32_t j = 0; j < n; j++) {
    const size_t from = size_t(j) * b;
    std::memcpy(out.data() + from, &data_[j * dw_], std::min<size_t>(b, len - from));
  }
  return out;
}

// ---- Receiver --------------------------------------------------------------------------------

Pushed Receiver::push(std::string_view raw, double now) {
  Pushed r;
  auto f = parseFrame(raw);
  if (!f) return r;
  if (auto c = closed_.find(f->id); c != closed_.end() && now < c->second) return r;
  auto it = streams_.begin();
  while (it != streams_.end() && it->id != f->id) ++it;
  if (it == streams_.end()) {
    if (streams_.size() >= max_) streams_.erase(streams_.begin());
    streams_.push_back({f->id, Decoder(f->n, f->len)});
    it = streams_.end() - 1;
  } else if (it->d.n != f->n || it->d.len != f->len) {
    return r;
  }
  r.id = f->id, r.n = f->n, r.len = f->len;
  const bool done = it->d.add(f->seed, f->data);
  r.rank = it->d.rank;
  if (!done) { r.status = Pushed::Progress; return r; }
  Stream s = std::move(*it);
  streams_.erase(it);
  closed_[r.id] = std::numeric_limits<double>::infinity();
  if (defer_) {
    ready_.push_back(std::move(s));
    r.status = Pushed::Ready;
    return r;
  }
  Pushed a = assemble(r.id, s.d);
  if (a.status == Pushed::Corrupt) closed_[r.id] = now + 5000;
  return a;
}

std::optional<Decoder> Receiver::take(const std::string &id) {
  for (auto it = ready_.begin(); it != ready_.end(); ++it) {
    if (it->id != id) continue;
    Decoder d = std::move(it->d);
    ready_.erase(it);
    return d;
  }
  return std::nullopt;
}

Pushed Receiver::assemble(const std::string &id, Decoder &d) {
  Pushed r;
  r.id = id, r.n = d.n, r.len = d.len, r.rank = d.rank;
  r.container = d.solve();
  if (streamId(r.container) != id) {
    r.container.clear();
    r.status = Pushed::Corrupt;
  } else {
    r.status = Pushed::Complete;
  }
  return r;
}

}  // namespace qretina
