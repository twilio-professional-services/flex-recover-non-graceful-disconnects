const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 * NOTE: UNNECESSARY AT PRESENT - SINCE THIS IS COVERED BY
 * CONFERENCE STATUS CALLBACK HANDLER ON CONFERENCE-END EVENT
 *
 * This function is invoked from the Flex Plugin to clear the current conference
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

  const { conferenceSid } = event;

  // Global sync map is used by the conference status handler to find the worker associated with
  // a conference - in determining when a worker leaves non-gracefully
  const globalSyncMapName = `Global.ActiveConferences`;

  await syncService.deleteMapItem(
      SYNC_SERVICE_SID,
      globalSyncMapName,
      conferenceSid
    );

  response.setBody({
    success: true,
  });

  callback(null, response);
});
