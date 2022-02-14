const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 *
 * This function is invoked from the Flex Plugin to clear the current worker from the
 * conference state - whenever they disconnect gracefully. This stops the status callback
 * logic from executing the non-graceful disconnect logic for the worker when the
 * particpant-leave event comes in
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

  const { conferenceSid, workerSid } = event;

  // Global sync map is used by the conference status handler to find the worker associated with
  // a conference - in determining when a worker leaves non-gracefully
  const globalSyncMapName = `Global.ActiveConferences`;

  console.debug(
    `Removing worker ${workerSid} from conference ${conferenceSid}`
  );

  const globalSyncMapItem = await syncService.getMapItem(
    SYNC_SERVICE_SID,
    globalSyncMapName,
    conferenceSid
  );

  if (!globalSyncMapItem) {
    // Nothing in the Sync Map for this conference (weird)
    response.setBody({
      status: 500,
    });
    return callback(null, response);
  }

  const newWorkers = globalSyncMapItem.data.workers.filter((w) => w.workerSid !== workerSid);

  const newSyncMapItemData = {
    ...globalSyncMapItem.data,
    workers: [...newWorkers]
  };

  await syncService.updateMapItem(
      SYNC_SERVICE_SID,
      globalSyncMapName,
      conferenceSid,
      newSyncMapItemData
    );

  response.setBody({
    status: 200,
    success: true,
  });

  callback(null, response);
});
