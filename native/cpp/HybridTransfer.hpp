// The Nitro objects of src/specs/Transfer.nitro.ts, over the transfer layer in core/qretina.hpp.
#pragma once
#include <mutex>
#include "HybridTransferEncoderSpec.hpp"
#include "HybridTransferReceiverSpec.hpp"
#include "HybridTransferSpec.hpp"
#include "qretina.hpp"

namespace margelo::nitro::qretinanative {

class HybridTransfer : public HybridTransferSpec {
 public:
  HybridTransfer() : HybridObject(TAG) {}
  std::string getProtocol() override;
  std::shared_ptr<HybridTransferReceiverSpec> createReceiver(double maxStreams) override;
  std::shared_ptr<HybridTransferEncoderSpec> createEncoder(const std::shared_ptr<ArrayBuffer>& container, double block) override;
};

// Scanned strings arrive on the JavaScript thread; finish() reassembles on a background thread.
// The mutex guards the core receiver's state between the two; reassembly itself runs unlocked.
class HybridTransferReceiver : public HybridTransferReceiverSpec {
 public:
  explicit HybridTransferReceiver(size_t maxStreams) : HybridObject(TAG), rx_(maxStreams, true) {}
  Pushed push(const std::string& frame, double now) override;
  std::shared_ptr<Promise<Assembled>> finish(const std::string& id) override;
  void hold(const std::string& id, double until) override;

 private:
  std::mutex lock_;
  ::qretina::Receiver rx_;
};

class HybridTransferEncoder : public HybridTransferEncoderSpec {
 public:
  HybridTransferEncoder(const ::qretina::Bytes& container, uint32_t block) : HybridObject(TAG), enc_(container, block) {}
  std::string getId() override { return enc_.id; }
  double getN() override { return enc_.n; }
  double getB() override { return enc_.b; }
  double getLen() override { return enc_.len; }
  std::string frame(double seed) override;

 private:
  ::qretina::Encoder enc_;
};

}  // namespace margelo::nitro::qretinanative
