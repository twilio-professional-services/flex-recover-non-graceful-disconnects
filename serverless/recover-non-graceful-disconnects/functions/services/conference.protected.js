const updateConferenceParticipant = async (
  conferenceSid,
  participantCallSid,
  payload
) => {
  const response = {};
  console.log(
    `Updating participant ${participantCallSid} for conference ${conferenceSid} with payload: ${JSON.stringify(
      payload
    )}`
  );
  try {
    const participantResponse = await twilioClient
      .conferences(conferenceSid)
      .participants(participantCallSid)
      .update(payload);
    response.participantResponse = participantResponse;
  } catch (error) {
    console.error(
      `Error updating participant ${participantCallSid} for conference ${conferenceSid}`,
      error
    );
    response.error = error;
  }

  return response;
};

const setEndConferenceOnExit = async (
  conferenceSid,
  participantCallSid,
  endConferenceOnExit
) => {
  const response = await updateConferenceParticipant(
    conferenceSid,
    participantCallSid,
    { endConferenceOnExit }
  );
  return response;
};

const makeConferenceAnnouncement = async (conferenceSid, announceUrl) => {
  const response = await updateConference(conferenceSid, { announceUrl });
  return response;
};

const updateConference = async (conferenceSid, payload) => {
  const response = {};
  console.log(
    `Updating ${conferenceSid} with payload: ${JSON.stringify(payload)}`
  );
  try {
    const conferenceResponse = await twilioClient
      .conferences(conferenceSid)
      .update(payload);
    response.conferenceResponse = conferenceResponse;
  } catch (error) {
    console.error(`Error updating conference ${conferenceSid}`, error);
    response.error = error;
  }

  return response;
};

module.exports = {
  updateConference,
  updateConferenceParticipant,
  makeConferenceAnnouncement,
  setEndConferenceOnExit,
};
