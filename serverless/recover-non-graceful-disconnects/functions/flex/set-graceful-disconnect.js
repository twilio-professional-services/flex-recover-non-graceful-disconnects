const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 * This function is invoked from the Flex Plugin to record that the agent left the conference
 * gracefully
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
  const sync = require(Runtime.getFunctions()["services/sync-map"].path);

  const { conferenceSid, workerSid } = event;

  const syncMapSuffix = "ActiveConferences";
    // Global sync map is used by the conference status handler to find the worker associated with
  // a conference - in determining when a worker leaves non-gracefully
  const globalSyncMapName = `Global.${syncMapSuffix}`;
  // Worker sync map is used by Flex Plugin to access state of a worker's active conferences
  // (e.g. after a page reload or after navigating away)
  const workerSyncMapName = `Worker.${workerSid}.${syncMapSuffix}`;


  console.log(
    `Setting wasGracefulWorkerDisconnect=true for conference ${conferenceSid}`
  );

  const globalSyncMapItem = await sync.getMapItem(
    SYNC_SERVICE_SID,
    globalSyncMapName,
    conferenceSid
  );

  if (!globalSyncMapItem) {
    // Nothing in the Sync Map for this conference (weird)
    return callback(null, {});
  }

  const newSyncMapItemData = {
    ...globalSyncMapItem.data,
    wasGracefulWorkerDisconnect: true,
  };


  await Promise.all([
    sync.updateMapItem(
      SYNC_SERVICE_SID,
      globalSyncMapName,
      conferenceSid,
      newSyncMapItemData
    ),
    sync.updateMapItem(
      SYNC_SERVICE_SID,
      workerSyncMapName,
      conferenceSid,
      newSyncMapItemData
    )
  ]);

  response.setBody({
    success: true,
  });

  callback(null, response);
});
