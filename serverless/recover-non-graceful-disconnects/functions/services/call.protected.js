const fetchCall = async (callSid) => {
  const response = {};

  console.debug(`Fetching call ${callSid}`);
  try {
    const callResponse = await twilioClient.calls(callSid).fetch();
    response.callResponse = callResponse;
  } catch (error) {
    console.error(`Error fetching call ${callSid}`, error);
    response.error = error;
  }

  return response;
};

const updateCall = async (callSid, payload) => {
  const response = {};

  console.debug(`Updating call ${callSid} with payload ${payload}`);
  try {
    const callResponse = await twilioClient.calls(callSid).update(payload);
    response.callResponse = callResponse;
  } catch (error) {
    console.error("Failed to update call", error);
    response.error = error;
  }

  return response;
};

const dialCallIntoConference = async (
  callSid,
  conferenceName,
  label,
  endConferenceOnExit
) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.dial().conference(
    {
      label,
      endConferenceOnExit,
    },
    conferenceName
  );

  return await updateCall(callSid, { twiml: twiml.toString() });
};

const enqueueCallTask = async (callSid, workflowSid, attributes, priority) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml
    .enqueue({
      workflowSid,
    })
    .task(
      {
        priority,
      },
      JSON.stringify(attributes)
    );

  return await updateCall(callSid, { twiml: twiml.toString() });
};

module.exports = {
  fetchCall,
  updateCall,
  dialCallIntoConference,
  enqueueCallTask,
};
