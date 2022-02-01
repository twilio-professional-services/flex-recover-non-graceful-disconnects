const createSyncMap = (serviceSid, mapName) => {
  console.debug(`Creating Sync Map ${mapName}`);
  return twilioClient.sync.services(serviceSid).syncMaps.create({
    uniqueName: mapName,
  });
};

const addMapItem = async (serviceSid, mapName, itemKey, itemData, isRetry) => {
  console.debug(`Adding ${itemKey} to Sync Map ${mapName}`);
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
      console.error(
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

const deleteMapItem = async (serviceSid, mapName, key) => {
  try {
    await twilioClient.sync
      .services(serviceSid)
      .syncMaps(mapName)
      .syncMapItems(key)
      .remove();
  } catch (error) {
    console.debug(`Unable to delete Map Item: ${error}`);
    throw error;
  }
};

const updateMapItem = async (serviceSid, mapName, itemKey, itemData) => {
  console.debug(`Updating ${itemKey} in sync map ${mapName}`);
  try {
    await twilioClient.sync
      .services(serviceSid)
      .syncMaps(mapName)
      .syncMapItems(itemKey)
      .update({
        data: itemData,
      });
  } catch (error) {
    console.error(`Error updating ${itemKey} in sync map ${mapName}.`, error);
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
