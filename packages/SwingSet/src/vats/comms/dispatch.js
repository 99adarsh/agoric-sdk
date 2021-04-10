import { assert, details as X } from '@agoric/assert';
import { makeVatSlot, insistVatType, parseVatSlot } from '../../parseVatSlots';
import { makeState } from './state';
import { deliverToController } from './controller';
import { insistCapData } from '../../capdata';

import { makeCListKit } from './clist';
import { makeDeliveryKit } from './delivery';
import { cdebug } from './cdebug';

export const debugState = new WeakMap();

export function buildCommsDispatch(
  syscall,
  _state,
  _helpers,
  _vatPowers,
  vatParameters = {},
) {
  const { identifierBase = 0, sendExplicitSeqNums = true } = vatParameters;
  const state = makeState(null, identifierBase);
  const clistKit = makeCListKit(state, syscall);

  function transmit(remoteID, msg) {
    const remote = state.getRemote(remoteID);
    // the vat-tp "integrity layer" is a regular vat, so it expects an argument
    // encoded as JSON
    const seqNum = sendExplicitSeqNums ? remote.nextSendSeqNum() : '';
    remote.advanceSendSeqNum();
    const ackSeqNum = remote.lastReceivedSeqNum();
    const args = harden({
      body: JSON.stringify([`${seqNum}:${ackSeqNum}:${msg}`]),
      slots: [],
    });
    syscall.send(remote.transmitterID(), 'transmit', args); // sendOnly
  }

  const deliveryKit = makeDeliveryKit(state, syscall, transmit, clistKit);

  const { sendFromKernel, resolveFromKernel, messageFromRemote } = deliveryKit;

  // our root object (o+0) is the Comms Controller
  const controller = makeVatSlot('object', true, 0);
  state.addMetaObject(controller);
  cdebug(`comms controller is ${controller}`);

  function deliver(target, method, args, result) {
    // console.debug(`comms.deliver ${target} r=${result}`);
    insistCapData(args);

    if (target === controller) {
      return deliverToController(
        state,
        clistKit,
        method,
        args,
        result,
        syscall,
      );
    }

    const remoteID = state.getRemoteReceiver(target);
    if (remoteID) {
      assert(method === 'receive', X`unexpected method ${method}`);
      // the vat-tp integrity layer is a regular vat, so when they send the
      // received message to us, it will be embedded in a JSON array
      const message = JSON.parse(args.body)[0];
      return messageFromRemote(remoteID, message, result);
    }

    // If we get to this point, the message is not being delivered to a
    // meta-object and so `sendFromKernel()` can proceed with translating the
    // message into local space and processing it.  However, since a message to
    // a meta-object never reaches this translation step, it means that neither
    // a PromiseTable entry nor a local promise ID are ever allocated for such a
    // message's `result` parameter.  If the kernel were to pipeline a
    // subsequent message to that result, that message could, in principle,
    // arrive at this point in the code without there being any local entity to
    // deliver it *to*.  If this were to happen, `sendFromKernel()` would throw
    // an exception when it fails to translate the message target, and
    // consequently kill the vat.  Fortunately, we don't believe any special
    // handling is required for this eventuality because it should never happen:
    // (1) `messageFromRemote()` does not make use of the result parameter at
    // all, and (2) `deliverToController()` always resolves the result with a
    // direct `syscall.resolve()` call in the same crank, short-circuiting the
    // kernel's pipeline delivery mechanism.  If such a case *does* happen, it
    // can only be the result of a kernel bug (i.e., the pipeline short-circuit
    // logic malfunctioned) or a bug in one of the comms controller object's
    // method handlers (i.e., it failed to resolve the result in the same
    // crank).  The resulting abrupt comms vat termination should serve as a
    // diagnostic signal that we have a bug that must be corrected.

    args.slots.map(s =>
      assert(
        !state.hasMetaObject(s),
        X`comms meta-object ${s} not allowed in message args`,
      ),
    );
    return sendFromKernel(target, method, args, result);
  }

  function notify(resolutions) {
    resolveFromKernel(resolutions);
  }

  function dropExports(vrefs) {
    assert(Array.isArray(vrefs));
    vrefs.map(vref => insistVatType('object', vref));
    vrefs.map(vref => assert(parseVatSlot(vref).allocatedByVat));
    console.log(`-- comms ignoring dropExports`);
  }

  const dispatch = harden({ deliver, notify, dropExports });
  debugState.set(dispatch, { state, clistKit });

  return dispatch;
}
