import { utils } from "../utils";

/**
 * Serverless APIs to perform conference-related updates and shield Flex UI from REST API calls
 */
class ConferenceService {
  /**
   * Ends the specified conference by updating status to completed
   *
   * @param conferenceSid
   */
  static endConference = async (conferenceSid) => {
    console.debug("endConference", conferenceSid);

    const endConferenceUrl = `${utils.baseServerlessUrl}/flex/end-conference`;
    const fetchBody = {
      Token: utils.userToken,
      conferenceSid,
    };

    const fetchOptions = utils.fetchPostUrlEncoded(fetchBody);
    const fetchResponse = await fetch(endConferenceUrl, fetchOptions);
    const endConferenceResult = await fetchResponse.json();
    console.debug("endConference result", endConferenceResult);
  };

  /**
   * Updates the participant's endConferenceOnExit flag
   *
   * @param conferenceSid
   * @param participantCallSid
   * @param endConferenceOnExit
   */
  static updateEndConferenceOnExit = async (
    conferenceSid,
    participantCallSid,
    endConferenceOnExit
  ) => {
    console.debug("updateEndConferenceOnExit", participantCallSid);

    const updateEndConferenceOnExitUrl = `${utils.baseServerlessUrl}/flex/update-end-conference-on-exit`;
    const fetchBody = {
      Token: utils.userToken,
      conferenceSid,
      participantCallSid,
      endConferenceOnExit,
    };

    const fetchOptions = utils.fetchPostUrlEncoded(fetchBody);
    const fetchResponse = await fetch(
      updateEndConferenceOnExitUrl,
      fetchOptions
    );
    const updateEndConferenceOnExitResult = await fetchResponse.json();
    console.debug(
      "updateEndConferenceOnExit result",
      updateEndConferenceOnExitResult
    );
  };
}

export default ConferenceService;
