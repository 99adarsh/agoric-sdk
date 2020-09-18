import { E } from '@agoric/eventual-send';

export function buildRootObject() {
  let dude;

  const self = harden({
    async bootstrap(vats, devices) {
      const vatMaker = E(vats.vatAdmin).createVatAdminService(devices.vatAdmin);

      // create a dynamic vat, send it a message and let it respond, to make
      // sure everything is working
      dude = await E(vatMaker).createVatByName('dude');
      await E(dude.root).foo(1);
      return 'bootstrap done';
    },
    async phase2() {
      // terminate as a second phase, so we can capture the kernel state in between
      E(dude.adminNode).terminate();
      await E(dude.adminNode).done();
    },
  });
  return self;
}
