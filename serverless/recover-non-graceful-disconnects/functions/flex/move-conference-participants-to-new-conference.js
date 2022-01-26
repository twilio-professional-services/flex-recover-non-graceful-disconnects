const Twilio = require("twilio");
const TokenValidator = require("twilio-flex-token-validator").functionValidator;

/**
 * This function is invoked from the Flex Plugin to initiate the transition of any
 * remaining conference participants from a "disconnected" conference, into a newly
 * established conference involving agent and customer.
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
  const callService = require(Runtime.getFunctions()["services/call"].path);

  const { conferenceSid, newConferenceName } = event;

  console.debug(
    `Moving remaining participants from ${conferenceSid} to conference name ${newConferenceName}`
  );

  // Go grab the conference participants
  const participants = await conferenceService.listParticipants(conferenceSid);

  if (!participants || participants.length == 0) {
    console.debug(`No participants were found for conference ${conferenceSid}`);
    response.setBody({
      status: 200,
      numberOfParticipantsMoved: 0,
    });
    return callback(null, response);
  }

  console.debug(
    `Found ${participants.length} remaining participants in ${conferenceSid}`
  );

  const successResponses = [];
  const errors = [];
  for (const participant of participants) {
    const { callSid, label, endConferenceOnExit } = participant;
    // Dial them in one by one.

    // Make sure call is in right status to be updated (customer might've dropped)
    // TODO: Speed could be optimized further by removing this fetch, and just swallow any status-related errors later
    const fetchServiceResponse = await callService.fetchCall(callSid);
    if (
      !fetchServiceResponse.callResponse ||
      fetchServiceResponse.callResponse.status !== "in-progress"
    ) {
      console.warn(
        `Call ${callSid} either not found, or not 'in-progress'. Not dialing them in`
      );
      fetchServiceResponse.callResponse &&
        console.debug(`Status is ${fetchServiceResponse.callResponse.status}`);
      continue;
    }

    // Dial em in if status is OK!
    console.debug(
      `Moving participant ${callSid} (label: '${label}') to new conference name ${newConferenceName}'; endConferenceOnExit: ${endConferenceOnExit})`
    );
    // TODO: Speed optimization - remove await, and fill up a promises array instead, then 
    // Promise.all()
    const dialServiceResponse = await callService.dialCallIntoConference(
      callSid,
      newConferenceName,
      label,
      endConferenceOnExit
    );
    console.debug(`dialServiceResponse ${JSON.stringify(dialServiceResponse)}`);
    const { callResponse, error } = dialServiceResponse;
    if (callResponse) {
      console.debug(`CallResponse`, callResponse);
      successResponses.push(callResponse);
    } else {
      console.error(`Error moving participant ${callSid}`, error);
      errors.push(error);
    }
  }

  response.setBody({
    status: errors.length > 0 ? 500 : 200,
    numberOfParticipantsMoved: successResponses.length,
    successResponses,
    errors,
  });
  if (errors.length > 0) {
    response.setStatusCode(500);
  }

  return callback(null, response);
});
