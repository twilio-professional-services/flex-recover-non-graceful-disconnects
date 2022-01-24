import TwilioSync from "twilio-sync";
import { utils } from "../utils";

class SyncService {
  constructor() {
    utils.loginHandler.on("tokenUpdated", this._tokenUpdateHandler);
  }

  _syncClient = new TwilioSync(utils.userToken);

  _tokenUpdateHandler = () => {
    console.debug("Updating Twilio Sync user token");

    const tokenInfo = utils.loginHandler.getTokenInfo();
    const accessToken = tokenInfo.token;

    this._syncClient.updateToken(accessToken);
  };

  initialize = () => {};

  getSyncMap = async (syncMapName, syncMapTtl) => {
    let syncMap;
    try {
      syncMap = await this._syncClient.map({
        id: syncMapName,
        mode: "open_or_create",
        ttl: syncMapTtl,
      });
      return syncMap;
    } catch (error) {
      console.error(`Error getting sync map ${syncMapName}`, error);
      return undefined;
    }
  };

  resetSyncMapTtl = async (syncMap, syncMapTtl) => {
    try {
      await syncMap.setTtl(syncMapTtl);
      console.debug(
        `Reset TTL for sync map ${syncMap.uniqueName} to ${syncMapTtl} seconds`
      );
    } catch (error) {
      console.error(
        `Error resetting TTL for sync map ${syncMap.uniqueName}.`,
        error
      );
    }
  };
}

const SyncServiceSingleton = new SyncService();

export default SyncServiceSingleton;
