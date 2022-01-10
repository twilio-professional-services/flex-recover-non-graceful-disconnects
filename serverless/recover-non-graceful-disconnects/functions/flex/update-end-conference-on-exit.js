const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 * This function is invoked from the Flex Plugin to update the endConferenceOnExit flag
 *
 */
exports.handler = TokenValidator(async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader("Access-Control-Allow-Origin", "*");
  response.appendHeader("Access-Control-Allow-Methods", "OPTIONS POST GET");
  response.appendHeader("Access-Control-Allow-Headers", "Content-Type");
  response.appendHeader("Content-Type", "application/json");

  const { ACCOUNT_SID, AUTH_TOKEN } = context;
  const twilioClient = Twilio(ACCOUNT_SID, AUTH_TOKEN);
  const conference = require(Runtime.getFunctions()["services/conference"]
    .path);

  const { conferenceSid, participantCallSid, endConferenceOnExit } = event;

  console.log(
    `Setting endConferenceOnExit to ${endConferenceOnExit} for participant ${participantCallSid} in conference ${conferenceSid}`
  );
  const serviceResponse = await conference.setEndConferenceOnExit(
    conferenceSid,
    participantCallSid,
    endConferenceOnExit
  );
  if (serviceResponse.participantResponse) {
    const participantResponse = serviceResponse.participantResponse;
    response.setBody({
      status: 200,
      participantResponse,
    });
  } else {
    const { error } = serviceResponse;
    console.error(
      `Error setting endConferenceOnExit to ${endConferenceOnExit} for participant ${participantCallSid} in conference ${conferenceSid}`,
      error
    );
    response.setBody({
      status: error.status || 500,
      error,
    });
    response.setStatusCode(error.status || 500);
  }

  return callback(null, response);
});
