import { utils } from "../utils";

/**
 * Perform API call to backend state management (e.g. Twilio Sync or custom backend) to facilitate
 * sharing of conference/task details without needing to make frequent Twilio REST API calls.
 */
class ConferenceStateService {



  /**
   * Adds the initial state of the conference
   */
  static addActiveConference = async (
    conferenceSid,
    taskSid,
    taskAttributes,
    taskWorkflowSid,
    workerSid,
    customerCallSid,
    workerCallSid,
    workerName,
    wasGracefulWorkerDisconnect = false,
  ) => {
    console.debug("addActiveConference", conferenceSid);

    const addActiveConferenceUrl = `${utils.baseServerlessUrl}/flex/add-active-conference`;
    const fetchBody = {
      Token: utils.userToken,
      conferenceSid,
      taskSid,
      taskAttributes: JSON.stringify(taskAttributes),
      taskWorkflowSid,
      workerSid,
      customerCallSid,
      workerCallSid,
      workerName,
      wasGracefulWorkerDisconnect,
    };

    const fetchOptions = utils.fetchPostUrlEncoded(fetchBody);
    const fetchResponse = await fetch(addActiveConferenceUrl, fetchOptions);
    const addActiveConferenceResult = await fetchResponse.json();
    console.debug("addActiveConference result", addActiveConferenceResult);
    return addActiveConferenceResult;
  };

  /**
   * Updates the state of the conference to reflect graceful agent termination
   *
   * @param conferenceSid
   *
   */
  static setGracefulDisconnect = async (conferenceSid, workerSid) => {
    console.debug("setGracefulDisconnect", conferenceSid);

    const setGracefulDisconnectUrl = `${utils.baseServerlessUrl}/flex/set-graceful-disconnect`;
    const fetchBody = {
      Token: utils.userToken,
      conferenceSid,
      workerSid
    };

    const fetchOptions = utils.fetchPostUrlEncoded(fetchBody);
    const fetchResponse = await fetch(setGracefulDisconnectUrl, fetchOptions);
    const setGracefulDisconnectResult = await fetchResponse.json();
    console.debug("setGracefulDisconnect result", setGracefulDisconnectResult);
    return setGracefulDisconnectResult;
  };

  /**
   * Clears the conference state for this SID
   *
   * @param conferenceSid
   */
  static clearActiveConference = async (conferenceSid) => {
    console.debug("clearActiveConference", conferenceSid);

    const clearActiveConferenceUrl = `${utils.baseServerlessUrl}/flex/clear-active-conference`;
    const fetchBody = {
      Token: utils.userToken,
      conferenceSid,
    };

    const fetchOptions = utils.fetchPostUrlEncoded(fetchBody);
    const fetchResponse = await fetch(clearActiveConferenceUrl, fetchOptions);
    const clearActiveConferenceResult = await fetchResponse.json();
    console.debug("clearActiveConference result", clearActiveConferenceResult);
    return clearActiveConferenceResult;
  };
}

export default ConferenceStateService;
