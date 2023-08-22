// in-swingset implementation of the vault performance benchmark from packages/vats/test/bootstrapTests/bench-vaults-performance.js
//
// run with:
// bin/runner --verbose --chain --sbench --benchmark ${ROUNDS} --config demo/vaultPerfTest/vaultPerfTest-config.json run
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { assert } from '@agoric/assert';

import { Offers } from '@agoric/inter-protocol/src/clientSupport.js';

const log = console.log;

const collateralBrandKey = 'ATOM';

export function buildRootObject() {
  let benchmarkRounds = 0;
  let wallet;
  let walletOffersFacet;
  let brand;
  let subscriber;

  return Far('root', {
    async setup(vats, devices) {
      // XXX TODO: Some of this setup logic will be common to perhaps many
      // benchmarks.  The common portions should be factored out into a
      // benchmark support library as we learn from experience which are the
      // common parts and which are the benchmark-specific parts

      log(
        `benchmark setup(${JSON.stringify(vats)}, ${JSON.stringify(devices)})`,
      );
      await E(vats.bootstrap).consumeItem('vaultFactoryKit');

      const walletFactoryStartResult = await E(vats.bootstrap).consumeItem(
        'walletFactoryStartResult',
      );
      const agoricNames = await E(vats.bootstrap).consumeItem('agoricNames');
      const atomBrand = await E(agoricNames).lookup('brand', 'ATOM');
      const istBrand = await E(agoricNames).lookup('brand', 'IST');
      brand = {
        ATOM: atomBrand,
        IST: istBrand,
      };

      const bankManager = await E(vats.bootstrap).consumeItem('bankManager');
      const namesByAddressAdmin = await E(vats.bootstrap).consumeItem(
        'namesByAddressAdmin',
      );

      async function provideSmartWallet(walletAddress) {
        const bank = await E(bankManager).getBankForAddress(walletAddress);
        return E(walletFactoryStartResult.creatorFacet)
          .provideSmartWallet(walletAddress, bank, namesByAddressAdmin)
          .then(([walletPresence]) => walletPresence);
      }

      await provideSmartWallet('agoric1ldmtatp24qlllgxmrsjzcpe20fvlkp448zcuce');
      await provideSmartWallet('agoric140dmkrz2e42ergjj7gyvejhzmjzurvqeq82ang');
      await provideSmartWallet('agoric1w8wktaur4zf8qmmtn3n7x3r0jhsjkjntcm3u6h');
      wallet = await provideSmartWallet('agoric1open');
      walletOffersFacet = await E(wallet).getOffersFacet();

      const topics = await E(wallet).getPublicTopics();
      subscriber = topics.updates.subscriber;
    },
    async runBenchmarkRound() {
      benchmarkRounds += 1;
      log(`runBenchmarkRound #${benchmarkRounds}`);

      const openVault = async (i, n) => {
        const offerId = `open-vault-${i}-of-${n}-round-${benchmarkRounds}`;
        const offer = Offers.vaults.OpenVault(
          { brand },
          {
            offerId,
            collateralBrandKey,
            wantMinted: 5,
            giveCollateral: 1.0,
          },
        );

        await E(walletOffersFacet).executeOffer(offer);

        const upd = await E(subscriber).getUpdateSince();
        assert(
          upd.value.updated === 'offerStatus' &&
            upd.value.status.id === offerId &&
            upd.value.status.numWantsSatisfied === 1,
        );
      };

      const openN = async n => {
        const range = [...Array(n)].map((_, i) => i + 1);
        await Promise.all(range.map(i => openVault(i, n)));
      };

      await openN(1);
    },
  });
}
