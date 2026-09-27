// Checks the C++ core against test/vectors/streams.txt (written by tools/vectors.mjs from the JS
// reference) and times a 4 MiB transfer. Usage: test <vectors file>
#include <chrono>
#include <cstdio>
#include <fstream>
#include <random>
#include <sstream>

#include "qretina.hpp"

using namespace qretina;

static int failures = 0;
#define CHECK(cond, what) do { if (!(cond)) { failures++; std::fprintf(stderr, "FAIL %s\n", std::string(what).c_str()); } } while (0)

static Bytes unhex(const std::string &s) {
  Bytes out;
  if (s == "-") return out;
  for (size_t i = 0; i + 1 < s.size(); i += 2) out.push_back(uint8_t(std::stoi(s.substr(i, 2), nullptr, 16)));
  return out;
}

int main(int argc, char **argv) {
  std::ifstream in(argc > 1 ? argv[1] : "test/vectors/streams.txt");
  if (!in) { std::fprintf(stderr, "no vectors file\n"); return 2; }
  std::string line, name;
  Bytes container;
  std::optional<Encoder> enc;
  Receiver rx;
  bool done = true;
  int frames = 0, feeds = 0, cases = 0;
  auto finish = [&] { CHECK(done, "case " + name + ": the reception did not complete"); };

  while (std::getline(in, line)) {
    std::istringstream ls(line);
    std::string kind;
    ls >> kind;
    const std::string rest = line.size() > kind.size() ? line.substr(kind.size() + 1) : "";
    if (kind == "mask") {
      uint32_t seed, n; std::string bits;
      ls >> seed >> n >> bits;
      const auto m = mask(seed, n);
      std::string got;
      for (uint32_t j = 0; j < n; j++) got += char('0' + ((m[j / 64] >> (j % 64)) & 1));
      CHECK(got == bits, "mask " + std::to_string(seed));
    } else if (kind == "sha256") {
      std::string a, b;
      ls >> a >> b;
      const Bytes in = unhex(a);
      CHECK(hex(sha256(in.data(), in.size()).data(), 32) == b, "sha256 of " + std::to_string(in.size()) + " bytes");
    } else if (kind == "case") {
      if (cases++) finish();
      uint32_t block;
      ls >> name >> block;
      std::getline(in, line);
      container = unhex(line.substr(10));
      enc.emplace(container, block);
      rx = Receiver();
      done = false;
    } else if (kind == "frame") {
      const size_t sp = rest.find(' ');
      const uint32_t seed = uint32_t(std::stoul(rest.substr(0, sp)));
      CHECK(enc->frame(seed) == rest.substr(sp + 1), "case " + name + ": frame " + std::to_string(seed));
      frames++;
    } else if (kind == "feed") {
      feeds++;
      if (done) continue;
      const auto r = rx.push(rest, 0);
      CHECK(r.status == Pushed::Progress || r.status == Pushed::Complete, "case " + name + ": a valid frame was not taken");
      if (r.status == Pushed::Complete) {
        CHECK(r.container == container, "case " + name + ": wrong container");
        CHECK(rx.push(rest, 0).status == Pushed::Ignored, "case " + name + ": completed stream not closed");
        done = true;
      }
    } else if (kind == "reject") {
      CHECK(!parseFrame(rest), "accepted: " + rest);
    }
  }
  finish();

  // Deferred reassembly: Ready first, then take() and assemble().
  {
    std::mt19937 g(3);
    Bytes c(5000);
    for (auto &x : c) x = uint8_t(g());
    Encoder e(c, 300);
    Receiver deferred(8, true);
    Pushed r;
    uint32_t s = 1;
    while ((r = deferred.push(e.frame(s), 0)).status == Pushed::Progress) s++;
    CHECK(r.status == Pushed::Ready && r.container.empty(), "deferred: reported ready without reassembling");
    CHECK(deferred.push(e.frame(s + 1), 0).status == Pushed::Ignored, "deferred: no frames taken once ready");
    auto d = deferred.take(r.id);
    CHECK(d.has_value() && !deferred.take(r.id), "deferred: taken exactly once");
    CHECK(d && Receiver::assemble(r.id, *d).container == c, "deferred: reassembles the container");
  }

  // 4 MiB of noise at 1,200 bytes per block, about 3,500 blocks: encode and decode.
  std::mt19937 gen(7);
  Bytes big(MAX_LEN);
  for (auto &x : big) x = uint8_t(gen());
  const auto t0 = std::chrono::steady_clock::now();
  Encoder e(big, 1200);
  Decoder d(e.n, e.len);
  uint32_t seed = 1;
  while (!d.add(seed, parseFrame(e.frame(seed))->data)) seed++;
  const bool same = d.solve() == big;
  const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  CHECK(same, "4 MiB round trip");
  std::printf("%d cases, %d frames, %d feeds; n=%u: encode + decode %.2f s, %u symbols\n", cases, frames, feeds, e.n, secs, seed);
  if (failures) std::fprintf(stderr, "%d failures\n", failures);
  return failures ? 1 : 0;
}
