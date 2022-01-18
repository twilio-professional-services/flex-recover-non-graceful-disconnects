import { utils } from "../utils";
import { SyncServ as TwilioSyncClient } from 'twilio-sync';
import { SyncService } from "../services";


const syncMapSuffix = 'ActiveConferences';
  // Setting a TTL on the sync map so it's automatically
  // cleaned up for inactive workers
const syncMapTtl = 604800; // 7 days * 24 hours * 3600 seconds

/**
 * Maintain worker's active conferences and use for determining non-graceful
 * call terminations (e.g. page refresh)
 */
class ConferenceState {

  _initialized = false;

  _syncMapName = `Worker.${utils.manager.workerClient.sid}.${syncMapSuffix}`;
  _syncMap;
  _syncMapItems;


  get hasActiveConference() {
    if (!this._syncMapItems) {
      return false;
    }

    return [...this._syncMapItems.values()]
      .some(confState => confState.wasGracefulWorkerDisconnect !== true);
  }

  currentState(conferenceSid) {
    if (!this._syncMapItems) {
      return undefined;
    }

    return this._syncMapItems.get(conferenceSid);
  }

  wasGracefulWorkerDisconnect(conferenceSid) {
    return this.currentState(conferenceSid)?.wasGracefulWorkerDisconnect ? true : false;
  }

  _prepItemForMap = (item) => {
    const { key, value } = item;
    const { attributes } = value;
    if (typeof attributes === 'string') {
      value.attributes = attributes && JSON.parse(attributes);
    }
    return { key, value };
  }

  _syncMapItemAdded = (i) => {
    console.debug('ConferenceState itemAdded', i);
    const item = this._prepItemForMap(i.item);
    this._syncMapItems.set(item.key, item.value);
  }

  _syncMapItemUpdated = (i) => {
    console.debug('ConferenceState itemUpdated', i);
    const item = this._prepItemForMap(i.item);
    this._syncMapItems.set(item.key, item.value);
  }

  _syncMapItemRemoved = (item) => {
    console.debug('ConferenceState itemRemoved', item.key);
    this._syncMapItems.delete(item.key);
  }

  initialize = async () => {
    console.debug('ConferenceState initialize started');
  
    const syncMap = await SyncService.getSyncMap(this._syncMapName, syncMapTtl);
    if (syncMap.sid) {
      this._syncMap = syncMap;
    } else {
      console.error('ConferenceState failed to initialize. Unable to retrieve sync map.', syncMap.error);
      return;
    }
    const syncMapItems = await this._syncMap.getItems();
    this._syncMapItems = new Map(syncMapItems.items.map(i => {
      const item = this._prepItemForMap(i);
      return [item.key, item.value];
    }));
    this._syncMap.on('itemAdded', this._syncMapItemAdded);
    this._syncMap.on('itemUpdated', this._syncMapItemUpdated);
    this._syncMap.on('itemRemoved', this._syncMapItemRemoved);

    // Refreshing the sync map TTL so it doesn't expire while actively being used
    await SyncService.resetSyncMapTtl(this._syncMap, syncMapTtl);

    this._initialized = true;
    console.debug('ConferenceState initialize finished');
  }
}

const ConferenceStateSingleton = new ConferenceState();

export default ConferenceStateSingleton;