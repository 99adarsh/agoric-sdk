import makeMapInbound from './makeMapInbound';

// TODO: implement verify
function verify(_senderID) {
  return true;
}

function parseJSON(data) {
  try {
    const d = JSON.parse(data);
    return d;
  } catch (e) {
    console.log(`unparseable data: ${data}`);
    throw e;
  }
}

export function makeSendIn(state, syscall) {
  return {
    /**
     * aka 'inbound' from SwingSet-Cosmos
     * @param  {string} senderID public key?
     * @param  {string} dataStr JSON, such as:
     * {
     *  index: 0,
     *  methodName: 'getIssuer',
     *  args: [],
     *  resultIndex: 1,
     * }
     *
     */

    sendIn(senderID, dataStr) {
      if (!verify(senderID)) {
        throw new Error('could not verify SenderID');
      }

      const mapInbound = makeMapInbound(syscall, state, senderID);

      const data = parseJSON(dataStr);

      // everything that comes in to us as a target or a slot needs to
      // get mapped to a kernel slot. If we don't already have a kernel slot for
      // something, we should allocate it.

      // if not an event, then we are going to be calling something on
      // an object that we know about (is this right?)

      // get the target (an object representing a promise or a vat
      // object) from the index in the data

      let kernelToMeSlots;
      let kernelToMeTarget;
      if (data.slots) {
        kernelToMeSlots = data.slots.map(mapInbound);
      }
      if (data.target) {
        kernelToMeTarget = state.clists.mapIncomingWireMessageToKernelSlot(
          senderID,
          data.target,
        );
      }

      if (data.event) {
        // if the "promise" is a your-question, then we may not have
        // any knowledge of it. It is something that the other machine
        // told us about, but all we know is the promise id, and the id
        // that we use in communication with the other machine

        const promiseKernelToMeSlot = mapInbound(data.promise);
        const resolverKernelToMeSlot = state.resolvers.getResolver(
          promiseKernelToMeSlot,
        );
        switch (data.event) {
          case 'notifyFulfillToData':
            syscall.fulfillToData(
              resolverKernelToMeSlot.id,
              data.args,
              kernelToMeSlots,
            );
            return;
          case 'notifyFulfillToTarget':
            syscall.fulfillToTarget(
              resolverKernelToMeSlot.id,
              kernelToMeTarget,
            );
            return;
          case 'notifyReject':
            syscall.notifyReject(
              resolverKernelToMeSlot.id,
              data.args,
              kernelToMeSlots,
            );
            return;
          default:
            throw new Error(`unknown event ${data.event}`);
        }
      }

      /* slots are used when referencing a
        presence as an arg, e.g.:
        {
          index: 2,
          methodName: 'deposit',
          args: [20, { '@qclass': 'slot', index: 0 }],
          slots: [{ type: 'export', index: 0 }],
          resultIndex: 3,
        }
      */

      // put the target.methodName(args, slots) call on the runQueue to
      // be delivered
      const promiseID = syscall.send(
        kernelToMeTarget,
        data.methodName,
        JSON.stringify({ args: data.args }),
        kernelToMeSlots,
      );

      // if there is a resultIndex passed in, the inbound sender wants
      // to know about the result, so we need to store this in clist for
      // the sender to have future access to

      if (data.resultSlot) {
        const kernelToMeSlot = {
          type: 'promise',
          id: promiseID,
        };
        const youToMeSlot = data.resultSlot; // your-answer = our answer, their question
        const meToYouSlot = state.clists.changePerspective(youToMeSlot);
        state.clists.add(senderID, kernelToMeSlot, youToMeSlot, meToYouSlot);
        syscall.subscribe(promiseID);
      }
    },
  };
}
