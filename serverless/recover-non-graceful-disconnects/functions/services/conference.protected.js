const updateConferenceParticipant = async (
  conferenceSid,
  participantCallSid,
  payload
) => {
  const response = {};
  console.debug(
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
  console.debug(
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

const fetchConference = async (conferenceSid) => {
  console.debug(`Fetching conference ${conferenceSid}`);
  try {
    const conference = await twilioClient.conferences(conferenceSid).fetch();
    return conference;
  } catch (error) {
    console.error(`Error fetching conference ${conferenceSid}`, error);
    return undefined;
  }
};

const listParticipants = async (conferenceSid, attributes) => {
  console.debug(`Listing participants for conference ${conferenceSid}`);
  try {
    const participants = await twilioClient
      .conferences(conferenceSid)
      .participants.list(attributes);
    return participants;
  } catch (error) {
    console.error(
      `Error listing participants for conference ${conferenceSid}`,
      error
    );
    return [];
  }
};

const fetchParticipant = async (conferenceSid, participantCallSid) => {
  console.debug(
    `Fetching participant ${participantCallSid} for conference ${conferenceSid}`
  );
  try {
    const participant = await twilioClient
      .conferences(conferenceSid)
      .participants(participantCallSid)
      .fetch();
    return participant;
  } catch (error) {
    console.error(
      `Error fetching participant ${participantCallSid} for conference ${conferenceSid}`,
      error
    );
    return undefined;
  }
};

module.exports = {
  updateConference,
  updateConferenceParticipant,
  makeConferenceAnnouncement,
  setEndConferenceOnExit,
  fetchConference,
  fetchParticipant,
  listParticipants,
};
