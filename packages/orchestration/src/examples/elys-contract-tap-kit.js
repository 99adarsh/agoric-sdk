import { M, mustMatch } from '@endo/patterns';
import { VowShape } from '@agoric/vow';
import { makeTracer } from '@agoric/internal';
import { ChainAddressShape } from '../typeGuards.js';
import * as tokenflows from './elys-contract-token.flow.js';
import { FeeConfigShape } from './elys-contract-type-gaurd.js';

const trace = makeTracer('StrideStakingTap');

/**
 * @typedef {(
 *   orch: Orchestrator,
 *   ctx: any,
 *   incomingIbcTransferEvent: any,
 *   state: any,
 * ) => Promise<void>} TokenMovementAndStrideLSDFlow
 */

/**
 * @import {IBCChannelID, VTransferIBCEvent} from '@agoric/vats';
 * @import {Zone} from '@agoric/zone';
 * @import {TargetApp} from '@agoric/vats/src/bridge-target.js';
 * @import {ChainAddress, OrchestrationAccount, Orchestrator} from '@agoric/orchestration';
 * @import {TypedPattern} from '@agoric/internal';
 * @import {OrchestrationTools} from '../utils/start-helper.js';
 * @import {Passable} from '@endo/pass-style'
 */

/**
 * @typedef {{
 *   hostToAgoricChannel: IBCChannelID;
 *   nativeDenom: string;
 *   ibcDenomOnAgoric: string;
 *   ibcDenomOnStride: string;
 *   hostICAAccount: OrchestrationAccount<any>;
 *   hostICAAccountAddress: ChainAddress;
 *   bech32Prefix: string;
 * }} SupportedHostChainShape
 */
const SupportedHostChainShape = {
  hostToAgoricChannel: M.string(),
  nativeDenom: M.string(),
  ibcDenomOnAgoric: M.string(),
  ibcDenomOnStride: M.string(),
  hostICAAccount: M.any(),
  hostICAAccountAddress: ChainAddressShape,
  bech32Prefix: M.string(),
};
harden(SupportedHostChainShape);

/**
 * @typedef {{
 *   localAccount: OrchestrationAccount<{ chainId: string }>;
 *   localAccountAddress: ChainAddress;
 *   strideICAAccount: OrchestrationAccount<{ chainId: string }>;
 *   strideICAAddress: ChainAddress;
 *   elysICAAccount: OrchestrationAccount<{ chainId: string }>;
 *   elysICAAddress: ChainAddress;
 *   supportedHostChains: MapStore<string, SupportedHostChainShape>;
 *   elysToAgoricChannel: IBCChannelID;
 *   AgoricToElysChannel: IBCChannelID;
 *   stDenomOnElysTohostToAgoricChannelMap: MapStore<string, string>;
 *   agoricBech32Prefix: string;
 *   strideBech32Prefix: string;
 *   elysBech32Prefix: string;
 *   feeConfig: FeeConfigShape;
 * }} StrideStakingTapState
 */
/** @type {TypedPattern<StrideStakingTapState>} */
const StakingTapStateShape = {
  localAccount: M.any(),
  localAccountAddress: ChainAddressShape,
  strideICAAccount: M.any(),
  strideICAAddress: ChainAddressShape,
  elysICAAccount: M.any(),
  elysICAAddress: ChainAddressShape,
  supportedHostChains: M.any(),
  elysToAgoricChannel: M.string(),
  AgoricToElysChannel: M.string(),
  stDenomOnElysTohostToAgoricChannelMap: M.any(),
  agoricBech32Prefix: M.string(),
  strideBech32Prefix: M.string(),
  elysBech32Prefix: M.string(),
  feeConfig: FeeConfigShape,
};
harden(StakingTapStateShape);

/**
 * @param {Zone} zone
 * @param {OrchestrationTools} tools
 */
const prepareStrideStakingTapKit = (zone, tools) => {
  return zone.exoClassKit(
    'StrideStakingTapKit',
    {
      // Taps ibc transfer and start the stake/unstake to/from stride
      tap: M.interface('StrideAutoStakeTap', {
        receiveUpcall: M.call(M.record()).returns(
          M.or(VowShape, M.undefined()),
        ),
      }),
      voidWatcher: M.interface('voidWatcher', {
        nothingDoer: M.call(M.undefined()).returns(M.undefined()),
      }),
    },
    // @param {StrideStakingTapState & import('@endo/marshal').Passable} initialState
    /** @param {StrideStakingTapState & Passable} initialState */
    initialState => {
      mustMatch(initialState, StakingTapStateShape);
      return harden(initialState);
    },
    {
      tap: {
        /**
         * @param {VTransferIBCEvent & Passable} event
         */
        receiveUpcall(event) {
          trace('receiveUpcall', event);
          const { orchestrate, orchestrateAll, vowTools } = tools;
          const { watch } = vowTools;

          const state = this.state;
          const localAccount =
            /** @type {OrchestrationAccount<{ chainId: string }> & Passable} */ (
              this.state.localAccount
            );
          const strideICAAccount =
            /** @type {OrchestrationAccount<{ chainId: string }> & Passable} */ (
              this.state.strideICAAccount
            );
          const elysICAAccount =
            /** @type {OrchestrationAccount<{ chainId: string }> & Passable} */ (
              this.state.elysICAAccount
            );

          trace('contractTapKit, calling orchestateAll');

          // TODO: create random strings each time
          const durableName = `${event.acknowledgement}+${event.packet.destination_channel}+${event.packet.source_channel}`;
          const tokenMovementAndStrideLSDFlow = orchestrate(
            durableName,
            {},
            tokenflows.tokenMovementAndStrideLSDFlow,
          );

          return watch(
            tokenMovementAndStrideLSDFlow(
              harden(event),
              localAccount,
              state.localAccountAddress,
              strideICAAccount,
              state.strideICAAddress,
              elysICAAccount,
              state.elysICAAddress,
              state.supportedHostChains,
              state.elysToAgoricChannel,
              state.AgoricToElysChannel,
              state.stDenomOnElysTohostToAgoricChannelMap,
              state.agoricBech32Prefix,
              state.strideBech32Prefix,
              state.elysBech32Prefix,
              state.feeConfig,
            ),
          );
        },
      },
      voidWatcher: {
        nothingDoer() {
          return;
        },
      },
    },
  );
};

/**
 * Provides a {@link TargetApp} that reacts to an incoming IBC transfer by:
 *
 * @param {Zone} zone
 * @param {OrchestrationTools} tools
 * @returns {(
 *   ...args: Parameters<ReturnType<typeof prepareStrideStakingTapKit>>
 * ) => ReturnType<ReturnType<typeof prepareStrideStakingTapKit>>['tap']}
 */
export const prepareStrideStakingTap = (zone, tools) => {
  const makeKit = prepareStrideStakingTapKit(zone, tools);
  return (...args) => makeKit(...args).tap;
};

/** @typedef {ReturnType<typeof prepareStrideStakingTap>} MakeStrideStakingTap */
/** @typedef {ReturnType<MakeStrideStakingTap>} StakingTap */

// Add retries in ibc Transfer
