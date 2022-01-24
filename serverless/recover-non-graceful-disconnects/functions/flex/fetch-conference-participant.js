const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 * NOT USED. Comment is here for future use, but as of now this logic lives in
 * a branch of the flex-dialpad-addon-plugin
 *
 * This function is invoked from the Flex Plugin to poll the participant
 * when awaiting Flex native updates to endConferenceOnExit. UGLY.
 * TODO: Once participant-modify event is working (support ticket open), remove
 * this polling and use status callback event handler :)
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
  const conferenceService = require(Runtime.getFunctions()[
    "services/conference"
  ].path);

  const { conferenceSid, participantCallSid } = event;

  console.debug(
    `Fetching participant ${participantCallSid} for conference ${conferenceSid}`
  );
  const participant = await conferenceService.fetchParticipant(
    conferenceSid,
    participantCallSid
  );
  if (participant) {
    response.setBody({
      status: 200,
      participant,
    });
  } else {
    console.error(
      `Error fetching participant ${participantCallSid} for conference ${conferenceSid}`
    );
    response.setBody({
      status: 500,
    });
    response.setStatusCode(500);
  }

  return callback(null, response);
});
