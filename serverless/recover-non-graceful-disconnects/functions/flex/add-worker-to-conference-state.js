const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 * This function is invoked from the Flex Plugin to add a new worker to the state model.
 *
 * NOTE: For this implementation, we use a Sync Map.
 * In a real-world scenario, we would recommend using your own backend services to
 * maintain and access this call/conference state (for scalability reasons).
 *
 */
exports.handler = TokenValidator(async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader("Access-Control-Allow-Origin", "*");
  response.appendHeader("Access-Control-Allow-Methods", "OPTIONS POST GET");
  response.appendHeader("Access-Control-Allow-Headers", "Content-Type");
  response.appendHeader("Content-Type", "application/json");

  const { ACCOUNT_SID, AUTH_TOKEN, SYNC_SERVICE_SID } = context;
  const twilioClient = Twilio(ACCOUNT_SID, AUTH_TOKEN);
  const syncService = require(Runtime.getFunctions()["services/sync-map"].path);
  const conferenceService = require(Runtime.getFunctions()[
    "services/conference"
  ].path);

  const {
    conferenceSid,
    taskSid,
    taskWorkflowSid,
    taskAttributes,
    customerCallSid,
    workerSid,
    workerCallSid,
    workerName,
  } = event;

  // Global sync map is used by the conference status handler to find the worker associated with
  // a conference - in determining when a worker leaves non-gracefully
  const globalSyncMapName = `Global.ActiveConferences`;

  const conferenceSyncMapItemData = {
    taskSid,
    taskWorkflowSid,
    taskAttributes,
    customerCallSid,
  };
  const workers = [
    {
      workerSid,
      workerName,
      workerCallSid,
    },
  ];

  // Conference state may already exist or may need created if this is first worker
  const globalSyncMapItem = await syncService.getMapItem(
    SYNC_SERVICE_SID,
    globalSyncMapName,
    conferenceSid
  );

  if (!globalSyncMapItem) {
    const newSyncMapItemData = {
      ...conferenceSyncMapItemData,
      workers: [...workers],
    };

    await syncService.addMapItem(
      SYNC_SERVICE_SID,
      globalSyncMapName,
      conferenceSid,
      newSyncMapItemData
    );
  } else {
    const updatedWorkers = [...globalSyncMapItem.data.workers];

    // Update the state with new workers array, along with more task details from Flex
    // (saves us making a data-dip to Taskrouter for these)
    const updatedSyncMapItemData = {
      ...globalSyncMapItem.data,
      workers: [...updatedWorkers, ...workers],
      taskAttributes,
    };

    await syncService.updateMapItem(
      SYNC_SERVICE_SID,
      globalSyncMapName,
      conferenceSid,
      updatedSyncMapItemData
    );
  }

  response.setBody({
    success: true,
  });

  callback(null, response);
});
