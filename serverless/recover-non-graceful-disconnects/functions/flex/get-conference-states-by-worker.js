const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 * Gets all conference states for the current worker
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

  const { workerSid } = event;

  const syncMapSuffix = "ActiveConferences";

  // Worker sync map is used by Flex Plugin to access state of a worker's active conferences
  // (e.g. after a page reload or after navigating away)
  const workerSyncMapName = `Worker.${workerSid}.${syncMapSuffix}`;

  console.debug(
    `Getting all worker conference states for worker ${workerSid}`
  );

  const workerSyncMapItems = await syncService.getAllMapItems(
    SYNC_SERVICE_SID,
    workerSyncMapName
  );

  // De-"Sync"ify the object for Flex
  const conferenceStates = workerSyncMapItems.map((syncMapItem) => syncMapItem.data);

  response.setBody({
    status: 200,
    conferenceStates
  });

  callback(null, response);
});
