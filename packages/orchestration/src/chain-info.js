import { E } from '@endo/far';
import { mustMatch } from '@endo/patterns';
import { connectionKey } from './exos/chain-hub.js';
import fetchedChainInfo from './fetched-chain-info.js'; // Refresh with scripts/refresh-chain-info.ts
import { CosmosChainInfoShape } from './typeGuards.js';

/** @import {CosmosChainInfo, EthChainInfo, IBCConnectionInfo} from './types.js'; */

/** @typedef {CosmosChainInfo | EthChainInfo} ChainInfo */

const knownChains = /** @satisfies {Record<string, ChainInfo>} */ (
  harden({
    ...fetchedChainInfo,
    // FIXME does not have useful connections
    // UNTIL https://github.com/Agoric/agoric-sdk/issues/9492
    agoriclocal: {
      chainId: 'agoriclocal',
      connections: {
        'cosmoshub-4': {
          id: 'connection-1',
          client_id: '07-tendermint-3',
          counterparty: {
            client_id: '07-tendermint-2',
            connection_id: 'connection-1',
            prefix: {
              key_prefix: '',
            },
          },
          state: 3 /* IBCConnectionState.STATE_OPEN */,
          transferChannel: {
            portId: 'transfer',
            channelId: 'channel-1',
            counterPartyChannelId: 'channel-1',
            counterPartyPortId: 'transfer',
            ordering: 1 /* Order.ORDER_UNORDERED */,
            state: 3 /* IBCConnectionState.STATE_OPEN */,
            version: 'ics20-1',
          },
        },
        osmosislocal: {
          id: 'connection-0',
          client_id: '07-tendermint-2',
          counterparty: {
            client_id: '07-tendermint-2',
            connection_id: 'connection-1',
            prefix: {
              key_prefix: '',
            },
          },
          state: 3 /* IBCConnectionState.STATE_OPEN */,
          transferChannel: {
            portId: 'transfer',
            channelId: 'channel-0',
            counterPartyChannelId: 'channel-1',
            counterPartyPortId: 'transfer',
            ordering: 1 /* Order.ORDER_UNORDERED */,
            state: 3 /* IBCConnectionState.STATE_OPEN */,
            version: 'ics20-1',
          },
        },
      },
    },
  })
);

/** @typedef {typeof knownChains} KnownChains */

/**
 * Utility to reverse connection info perspective.
 *
 * @param {IBCConnectionInfo} connInfo
 * @returns {IBCConnectionInfo}
 */
const reverseConnInfo = connInfo => {
  const { transferChannel } = connInfo;
  return {
    id: connInfo.counterparty.connection_id,
    client_id: connInfo.counterparty.client_id,
    counterparty: {
      client_id: connInfo.client_id,
      connection_id: connInfo.id,
      prefix: {
        key_prefix: '',
      },
    },
    state: connInfo.state,
    transferChannel: {
      ...transferChannel,
      channelId: transferChannel.counterPartyChannelId,
      counterPartyChannelId: transferChannel.channelId,
      portId: transferChannel.counterPartyPortId,
      counterPartyPortId: transferChannel.portId,
    },
  };
};

/**
 * @param {ERef<import('@agoric/vats').NameHubKit['nameAdmin']>} agoricNamesAdmin
 * @param {string} name
 * @param {CosmosChainInfo} chainInfo
 * @param {(...messages: string[]) => void} [log]
 */
export const registerChain = async (
  agoricNamesAdmin,
  name,
  chainInfo,
  log = () => {},
) => {
  const { nameAdmin } = await E(agoricNamesAdmin).provideChild('chain');
  const { nameAdmin: connAdmin } =
    await E(agoricNamesAdmin).provideChild('chainConnection');

  mustMatch(chainInfo, CosmosChainInfoShape);
  const { connections = {}, ...vertex } = chainInfo;

  const promises = [
    E(nameAdmin)
      .update(name, vertex)
      .then(() => log(`registered agoricNames chain.${name}`)),
  ];

  const { chainId } = chainInfo;
  // FIXME updates redundantly, twice per edge
  for (const [counterChainId, connInfo] of Object.entries(connections)) {
    const key = connectionKey(chainId, counterChainId);
    const normalizedConnInfo =
      chainId < counterChainId ? connInfo : reverseConnInfo(connInfo);

    promises.push(
      E(connAdmin)
        .update(key, normalizedConnInfo)
        .then(() => log(`registering agoricNames chainConnection.${key}`)),
    );
  }
  // Bundle to pipeline IO
  await Promise.all(promises);
};

/**
 * Register all the chains that are known statically.
 *
 * @param {ERef<import('@agoric/vats').NameHubKit['nameAdmin']>} agoricNamesAdmin
 * @param {(...messages: string[]) => void} [log]
 */
export const registerKnownChains = async (agoricNamesAdmin, log) => {
  for await (const [name, info] of Object.entries(knownChains)) {
    await registerChain(agoricNamesAdmin, name, info, log);
  }
};
