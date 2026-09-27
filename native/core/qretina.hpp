// QRetina transfer layer in C++ (spec/qretina.yaml `frame` and `code`): frames, the fountain encoder, the
// GF(2) decoder and a receiver of interleaved streams. It produces the same frames and containers
// as protocol/fountain.js, word for word, and is checked against test/vectors/streams.txt.
// Containers are opened by the JS side; this layer only moves bytes.
#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace qretina {

inline constexpr std::string_view PROTOCOL = "QRT112C90";
inline constexpr uint32_t MAX_N = 4096, MAX_LEN = 1u << 22, MAX_B = 2900;

using Bytes = std::vector<uint8_t>;

uint32_t mulberry32(uint32_t &state);
// The coefficient mask of symbol `seed` over n blocks: bit j of word j / 64 selects block j.
std::vector<uint64_t> mask(uint32_t seed, uint32_t n);

std::string b45encode(const uint8_t *data, size_t len);
std::optional<Bytes> b45decode(std::string_view s);

std::array<uint8_t, 32> sha256(const uint8_t *data, size_t len);
std::string hex(const uint8_t *data, size_t len);
std::string streamId(const Bytes &container);

struct Frame {
  std::string id;
  uint32_t n, len, seed;
  Bytes data;
};
std::optional<Frame> parseFrame(std::string_view raw);

class Encoder {
 public:
  Encoder(const Bytes &container, uint32_t block);
  std::string frame(uint32_t seed) const;
  std::string id;
  uint32_t n, b, len;

 private:
  size_t words_;
  std::vector<uint64_t> blocks_;
};

class Decoder {
 public:
  Decoder(uint32_t n, uint32_t len);
  // Adds symbol `seed`; returns true once all n blocks are determined.
  bool add(uint32_t seed, const Bytes &data);
  Bytes solve();
  uint32_t n, len, b, rank = 0;

 private:
  size_t cw_, dw_;
  std::vector<uint64_t> coef_, data_;
  std::vector<bool> has_;
  std::unordered_set<uint32_t> seen_;
};

struct Pushed {
  enum Status { Ignored, Progress, Ready, Complete, Corrupt } status = Ignored;
  std::string id;
  uint32_t n = 0, len = 0, rank = 0;
  Bytes container;
};

class Receiver {
 public:
  // With deferSolve, a completed stream is reported Ready and kept until take(); reassembling it
  // (assemble) can then happen elsewhere, such as on another thread.
  explicit Receiver(size_t maxStreams = 8, bool deferSolve = false) : max_(maxStreams), defer_(deferSolve) {}
  // Feeds one scanned string; `now` is in milliseconds.
  Pushed push(std::string_view raw, double now);
  void hold(const std::string &id, double until) { closed_[id] = until; }
  // Removes and returns the decoder of a stream reported Ready.
  std::optional<Decoder> take(const std::string &id);
  // Reassembles a complete stream and checks it against its id: Complete, or Corrupt.
  static Pushed assemble(const std::string &id, Decoder &d);

 private:
  struct Stream { std::string id; Decoder d; };
  size_t max_;
  bool defer_;
  std::vector<Stream> streams_;                     // oldest first
  std::vector<Stream> ready_;                       // complete, waiting for take()
  std::unordered_map<std::string, double> closed_; // stream id -> ignored until this time
};

}  // namespace qretina
