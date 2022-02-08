const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 * This function is invoked from the Flex Plugin to persist the current conference
 * state - for use later when handling conference events.
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

  const syncMapPromises = [];

  const syncMapItemData = {
    taskSid,
    taskAttributes,
    taskWorkflowSid,
    customerCallSid,
    workerCallSid,
    workerSid,
    workerName,
    dateCreated: new Date().toISOString(),
  };

  await syncService.addMapItem(
      SYNC_SERVICE_SID,
      globalSyncMapName,
      conferenceSid,
      syncMapItemData
    );
    
  response.setBody({
    success: true,
  });

  callback(null, response);
});
