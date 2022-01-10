const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 * This function is invoked from the Flex Plugin to end the conference upon hangup
 * (and thus prevent the non-graceful recovery logic from engaging - since no further
 * particpant-leave events would fire)
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

  const { conferenceSid } = event;

  console.log(`Ending conference ${conferenceSid}`);
  const serviceResponse = await conference.updateConference(conferenceSid, {
    status: "completed",
  });
  if (serviceResponse.conferenceResponse) {
    const conferenceResponse = serviceResponse.conferenceResponse;
    response.setBody({
      status: 200,
      conferenceResponse,
    });
  } else {
    const { error } = serviceResponse;
    console.error(`Error completing conference ${conferenceSid}`, error);
    response.setBody({
      status: error.status || 500,
      error,
    });
    response.setStatusCode(error.status || 500);
  }

  return callback(null, response);
});
