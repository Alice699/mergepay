import {
  createConfig,
  getDefaultRialoClientConfig,
  type RialoClientConfig,
} from "@rialo/frost";
import {
  MergePayClient,
  type MergePayClientOptions,
} from "@mergepay/rialo-client";
import { webConfig } from "./config";

const defaultClientConfig = getDefaultRialoClientConfig(webConfig.network);

export const rialoClientConfig: RialoClientConfig = {
  ...defaultClientConfig,
  chain: webConfig.rpcUrl
    ? { ...defaultClientConfig.chain, rpcUrl: webConfig.rpcUrl }
    : defaultClientConfig.chain,
};

export const frostConfig = createConfig({
  clientConfig: rialoClientConfig,
  autoConnect: true,
  storageKey: "mergepay-rialo-session",
});

const mergePayClientOptions: MergePayClientOptions = {
  network: webConfig.network,
  ...(webConfig.rpcUrl ? { rpcUrl: webConfig.rpcUrl } : {}),
  ...(webConfig.programId ? { programId: webConfig.programId } : {}),
};

export const mergePayClient = new MergePayClient(mergePayClientOptions);

export const expectedChainId = rialoClientConfig.chain.id;
