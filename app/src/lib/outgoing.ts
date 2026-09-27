// Prepares a container for broadcasting. Everything sent is sealed with the current app key; with a
// group key, the content is sealed with it first. An item that arrived sealed with a known app key
// and needs no new group layer is sent exactly as received, so relays of it form one stream.
import { SEALED, keyId, seal, unseal } from '@qretina/protocol/containers.js';

export function outgoing(container: Uint8Array, appKeys: Uint8Array[], group?: Uint8Array): Uint8Array {
  const [current] = appKeys;
  let inner = container;
  if (container[0] === SEALED) {
    const opened = unseal(container, appKeys);
    if (opened) {
      inner = opened;
      if (!group && keyId(current) === keyIdOf(container)) return container;
    }
    // Sealed under a key other than an app key (a locked group item): relay it as it is, inside the app layer.
  }
  if (group && !(inner[0] === SEALED && keyIdOf(inner) === keyId(group))) inner = seal(group, inner);
  return current ? seal(current, inner) : inner;
}

const keyIdOf = (sealed: Uint8Array) =>
  Array.from(sealed.subarray(1, 9), x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
