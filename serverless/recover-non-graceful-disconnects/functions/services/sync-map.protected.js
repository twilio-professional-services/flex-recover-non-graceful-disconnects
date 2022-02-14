const createSyncMap = async (serviceSid, mapName) => {
  console.debug(`Creating Sync Map ${mapName}`);
  try {
    await twilioClient.sync.services(serviceSid).syncMaps.create({
      uniqueName: mapName,
    });
  } catch (error) {
  }
};

const addMapItem = async (serviceSid, mapName, itemKey, itemData, isRetry) => {
  console.debug(`Adding ${itemKey} to sync map ${mapName} with data ${JSON.stringify(itemData)}`);
  try {
    await twilioClient.sync
      .services(serviceSid)
      .syncMaps(mapName)
      .syncMapItems.create({
        key: itemKey,
        data: itemData,
        ttl: 86400,
      });
  } catch (error) {
    if (isRetry) {
      console.warn(
        `Failed to create ${itemKey} in Sync Map ${mapName}.`,
        error
      );
      return;
    }
    // Retry by creating sync map first (most common error scenario is that the map does not exist)
    await createSyncMap(serviceSid, mapName);
    await addMapItem(serviceSid, mapName, itemKey, itemData, true);
  }
};

const getMapItem = async (serviceSid, mapName, key) => {
  try {
    const response = await twilioClient.sync
      .services(serviceSid)
      .syncMaps(mapName)
      .syncMapItems(key)
      .fetch();
    const result = response ? response : undefined;
    return result;
  } catch (error) {}
};

const getAllMapItems = async (serviceSid, mapName) => {
  try {
    const response = await twilioClient.sync
      .services(serviceSid)
      .syncMaps(mapName)
      .syncMapItems
      .list({limit: 20});
    const result = response ? response : undefined;
    return result;
  } catch (error) {}
};

const deleteMapItem = async (serviceSid, mapName, itemKey) => {
  console.debug(`Deleting ${itemKey} from sync map ${mapName}`);

  try {
    await twilioClient.sync
      .services(serviceSid)
      .syncMaps(mapName)
      .syncMapItems(itemKey)
      .remove();
  } catch (error) {
    console.warn(`Unable to delete Map Item: ${error}`);
  }
};

const updateMapItem = async (serviceSid, mapName, itemKey, itemData) => {
  console.debug(`Updating ${itemKey} in sync map ${mapName} with data ${JSON.stringify(itemData)}`);
  try {
    await twilioClient.sync
      .services(serviceSid)
      .syncMaps(mapName)
      .syncMapItems(itemKey)
      .update({
        data: itemData,
      });
  } catch (error) {
    console.warn(`Error updating ${itemKey} in sync map ${mapName}.`, error);
  }
};

module.exports = {
  createSyncMap,
  addMapItem,
  getMapItem,
  getAllMapItems,
  deleteMapItem,
  updateMapItem,
};
